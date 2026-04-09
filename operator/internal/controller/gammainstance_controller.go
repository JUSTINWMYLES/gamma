package controller

import (
	"context"
	"fmt"
	"time"

	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"

	gammav1alpha1 "github.com/JUSTINWMYLES/gamma/operator/api/v1alpha1"
)

// GammaInstanceReconciler reconciles a GammaInstance object.
type GammaInstanceReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

// +kubebuilder:rbac:groups=gamma.io,resources=gammainstances,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=gamma.io,resources=gammainstances/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=gamma.io,resources=gammainstances/finalizers,verbs=update
// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=apps,resources=statefulsets,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=services;configmaps;persistentvolumeclaims,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups=autoscaling,resources=horizontalpodautoscalers,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=networking.k8s.io,resources=ingresses,verbs=get;list;watch;create;update;patch;delete

// Reconcile performs a single reconciliation loop for a GammaInstance CR.
func (r *GammaInstanceReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	// Fetch the GammaInstance CR.
	instance := &gammav1alpha1.GammaInstance{}
	if err := r.Get(ctx, req.NamespacedName, instance); err != nil {
		if errors.IsNotFound(err) {
			logger.Info("GammaInstance resource not found, likely deleted")
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	// Set status to Deploying on first reconcile.
	if instance.Status.Phase == "" || instance.Status.Phase == "Pending" {
		instance.Status.Phase = "Deploying"
		if err := r.Status().Update(ctx, instance); err != nil {
			logger.Error(err, "failed to update status to Deploying")
			return ctrl.Result{}, err
		}
	}

	// Step 1: Reconcile Redis (if enabled).
	if instance.Spec.Redis.IsRedisEnabled() {
		if err := r.reconcileRedisConfigMap(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "RedisConfigMap", err)
		}
		if err := r.reconcileRedisStatefulSet(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "RedisStatefulSet", err)
		}
		if err := r.reconcileRedisService(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "RedisService", err)
		}
	}

	// Step 2: Reconcile Server.
	if err := r.reconcileServerDeployment(ctx, instance); err != nil {
		return r.setFailedStatus(ctx, instance, "ServerDeployment", err)
	}
	if err := r.reconcileServerService(ctx, instance); err != nil {
		return r.setFailedStatus(ctx, instance, "ServerService", err)
	}

	// Step 3: Reconcile Client.
	if err := r.reconcileClientDeployment(ctx, instance); err != nil {
		return r.setFailedStatus(ctx, instance, "ClientDeployment", err)
	}
	if err := r.reconcileClientService(ctx, instance); err != nil {
		return r.setFailedStatus(ctx, instance, "ClientService", err)
	}

	// Step 4: Reconcile Ingress.
	if instance.Spec.Networking.Ingress.Enabled {
		if err := r.reconcileIngress(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "Ingress", err)
		}
	} else {
		if err := r.cleanupIngress(ctx, instance); err != nil {
			logger.Error(err, "failed to cleanup Ingress")
		}
	}

	// Step 5: Reconcile HPA.
	if instance.Spec.Autoscaling != nil && instance.Spec.Autoscaling.Enabled {
		if err := r.reconcileHPA(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "HPA", err)
		}
	} else {
		if err := r.cleanupHPA(ctx, instance); err != nil {
			logger.Error(err, "failed to cleanup HPA")
		}
	}

	// Step 6: Update status.
	if err := r.updateStatus(ctx, instance); err != nil {
		logger.Error(err, "failed to update status")
		return ctrl.Result{}, err
	}

	// Requeue after 30s for periodic health monitoring.
	return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
}

// setFailedStatus updates the CR status to Failed and returns an error result.
func (r *GammaInstanceReconciler) setFailedStatus(ctx context.Context, instance *gammav1alpha1.GammaInstance, resource string, err error) (ctrl.Result, error) {
	logger := log.FromContext(ctx)
	logger.Error(err, "failed to reconcile resource", "resource", resource)

	instance.Status.Phase = "Failed"
	meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
		Type:               resource + "Ready",
		Status:             metav1.ConditionFalse,
		Reason:             "ReconcileFailed",
		Message:            err.Error(),
		LastTransitionTime: metav1.Now(),
	})
	if statusErr := r.Status().Update(ctx, instance); statusErr != nil {
		logger.Error(statusErr, "failed to update status after failure")
	}
	return ctrl.Result{}, err
}

// updateStatus aggregates the status of all child resources and sets the phase.
func (r *GammaInstanceReconciler) updateStatus(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	// Check server deployment.
	serverDeploy := &appsv1.Deployment{}
	serverName := fmt.Sprintf("%s-server", instance.Name)
	if err := r.Get(ctx, types.NamespacedName{Name: serverName, Namespace: instance.Namespace}, serverDeploy); err == nil {
		instance.Status.ServerReadyReplicas = serverDeploy.Status.ReadyReplicas
		instance.Status.ServerEndpoint = fmt.Sprintf("%s.%s.svc.cluster.local:%d",
			serverName, instance.Namespace, instance.Spec.Server.ServerPort())
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "ServerReady",
			Status:             conditionStatus(serverDeploy.Status.ReadyReplicas > 0),
			Reason:             "DeploymentStatus",
			Message:            fmt.Sprintf("%d/%d replicas ready", serverDeploy.Status.ReadyReplicas, instance.Spec.Server.ServerReplicas()),
			LastTransitionTime: metav1.Now(),
		})
	}

	// Check client deployment.
	clientDeploy := &appsv1.Deployment{}
	clientName := fmt.Sprintf("%s-client", instance.Name)
	if err := r.Get(ctx, types.NamespacedName{Name: clientName, Namespace: instance.Namespace}, clientDeploy); err == nil {
		instance.Status.ClientReadyReplicas = clientDeploy.Status.ReadyReplicas
		instance.Status.ClientEndpoint = fmt.Sprintf("%s.%s.svc.cluster.local:80", clientName, instance.Namespace)
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "ClientReady",
			Status:             conditionStatus(clientDeploy.Status.ReadyReplicas > 0),
			Reason:             "DeploymentStatus",
			Message:            fmt.Sprintf("%d/%d replicas ready", clientDeploy.Status.ReadyReplicas, instance.Spec.Client.ClientReplicas()),
			LastTransitionTime: metav1.Now(),
		})
	}

	// Check Redis if enabled.
	if instance.Spec.Redis.IsRedisEnabled() {
		redisName := fmt.Sprintf("%s-redis", instance.Name)
		redisSts := &appsv1.StatefulSet{}
		if err := r.Get(ctx, types.NamespacedName{Name: redisName, Namespace: instance.Namespace}, redisSts); err == nil {
			instance.Status.RedisReady = redisSts.Status.ReadyReplicas > 0
			instance.Status.RedisEndpoint = fmt.Sprintf("%s.%s.svc.cluster.local:6379", redisName, instance.Namespace)
			meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
				Type:               "RedisReady",
				Status:             conditionStatus(redisSts.Status.ReadyReplicas > 0),
				Reason:             "StatefulSetStatus",
				Message:            fmt.Sprintf("%d/1 replicas ready", redisSts.Status.ReadyReplicas),
				LastTransitionTime: metav1.Now(),
			})
		}
	} else {
		instance.Status.RedisReady = false
		instance.Status.RedisEndpoint = ""
	}

	// Compute overall phase.
	instance.Status.Phase = computePhase(instance)
	instance.Status.ObservedGeneration = instance.Generation

	return r.Status().Update(ctx, instance)
}

// computePhase determines the overall deployment phase.
func computePhase(instance *gammav1alpha1.GammaInstance) string {
	serverReady := instance.Status.ServerReadyReplicas >= instance.Spec.Server.ServerReplicas()
	clientReady := instance.Status.ClientReadyReplicas >= instance.Spec.Client.ClientReplicas()
	redisReady := !instance.Spec.Redis.IsRedisEnabled() || instance.Status.RedisReady

	if serverReady && clientReady && redisReady {
		return "Running"
	}

	// If some replicas are ready but not all, the deployment is degraded.
	if instance.Status.ServerReadyReplicas > 0 || instance.Status.ClientReadyReplicas > 0 {
		return "Degraded"
	}

	return "Deploying"
}

func conditionStatus(ready bool) metav1.ConditionStatus {
	if ready {
		return metav1.ConditionTrue
	}
	return metav1.ConditionFalse
}

// labelsForComponent returns the standard labels for a managed resource.
func labelsForComponent(instance *gammav1alpha1.GammaInstance, component string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":       "gamma",
		"app.kubernetes.io/instance":   instance.Name,
		"app.kubernetes.io/component":  component,
		"app.kubernetes.io/managed-by": "gamma-operator",
		"gamma.io/instance":            instance.Name,
	}
}

// selectorLabelsForComponent returns the labels used in pod selectors.
func selectorLabelsForComponent(instance *gammav1alpha1.GammaInstance, component string) map[string]string {
	return map[string]string{
		"app.kubernetes.io/name":      "gamma",
		"app.kubernetes.io/instance":  instance.Name,
		"app.kubernetes.io/component": component,
	}
}

// createOrUpdate is a helper that wraps controllerutil.CreateOrUpdate with owner references.
func (r *GammaInstanceReconciler) createOrUpdate(ctx context.Context, instance *gammav1alpha1.GammaInstance, obj client.Object, mutate func() error) error {
	if err := controllerutil.SetControllerReference(instance, obj, r.Scheme); err != nil {
		return fmt.Errorf("setting controller reference: %w", err)
	}
	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, obj, mutate)
	return err
}

// SetupWithManager sets up the controller with the Manager.
func (r *GammaInstanceReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&gammav1alpha1.GammaInstance{}).
		Owns(&appsv1.Deployment{}).
		Owns(&appsv1.StatefulSet{}).
		Owns(&corev1.Service{}).
		Owns(&corev1.ConfigMap{}).
		Owns(&networkingv1.Ingress{}).
		Owns(&autoscalingv2.HorizontalPodAutoscaler{}).
		Complete(r)
}
