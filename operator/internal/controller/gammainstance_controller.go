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
// +kubebuilder:rbac:groups=apps,resources=deployments;statefulsets,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=services;configmaps;persistentvolumeclaims,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups="",resources=events,verbs=create;patch
// +kubebuilder:rbac:groups=autoscaling,resources=horizontalpodautoscalers,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=networking.k8s.io,resources=ingresses,verbs=get;list;watch;create;update;patch;delete

// Reconcile performs a single reconciliation loop for a GammaInstance CR.
func (r *GammaInstanceReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	logger := log.FromContext(ctx)

	instance := &gammav1alpha1.GammaInstance{}
	if err := r.Get(ctx, req.NamespacedName, instance); err != nil {
		if errors.IsNotFound(err) {
			logger.Info("GammaInstance resource not found, likely deleted")
			return ctrl.Result{}, nil
		}
		return ctrl.Result{}, err
	}

	if instance.Status.Phase == "" || instance.Status.Phase == "Pending" {
		instance.Status.Phase = "Deploying"
		if err := r.Status().Update(ctx, instance); err != nil {
			logger.Error(err, "failed to update status to Deploying")
			return ctrl.Result{}, err
		}
	}

	if instance.Spec.TTS.IsTTSEnabled() {
		if !instance.Spec.Redis.IsRedisEnabled() {
			return r.setFailedStatus(ctx, instance, "TTSDependencies", fmt.Errorf("spec.tts.enabled=true requires spec.redis.enabled=true"))
		}
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "TTSDependenciesReady",
			Status:             metav1.ConditionTrue,
			Reason:             "DependenciesSatisfied",
			Message:            "Redis is enabled for TTS",
			LastTransitionTime: metav1.Now(),
		})
	} else {
		removeCondition(&instance.Status.Conditions, "TTSDependenciesReady")
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

	// Step 2: Reconcile News Broadcast TTS stack.
	if instance.Spec.TTS.IsTTSEnabled() {
		if err := r.reconcileMinIOPVC(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "TTSMinIOPVC", err)
		}
		if err := r.reconcileMinIOService(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "TTSMinIOService", err)
		}
		if err := r.reconcileMinIODeployment(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "TTSMinIODeployment", err)
		}
		if err := r.reconcileTTSAPIService(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "TTSAPIService", err)
		}
		if err := r.reconcileTTSAPIDeployment(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "TTSAPIDeployment", err)
		}
		if err := r.reconcileTTSWorkerDeployment(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "TTSWorkerDeployment", err)
		}
	} else {
		if err := r.cleanupTTS(ctx, instance); err != nil {
			logger.Error(err, "failed to cleanup TTS resources")
		}
	}

	// Step 3: Reconcile Server.
	if err := r.reconcileServerDeployment(ctx, instance); err != nil {
		return r.setFailedStatus(ctx, instance, "ServerDeployment", err)
	}
	if err := r.reconcileServerService(ctx, instance); err != nil {
		return r.setFailedStatus(ctx, instance, "ServerService", err)
	}

	// Step 4: Reconcile Client.
	if err := r.reconcileClientDeployment(ctx, instance); err != nil {
		return r.setFailedStatus(ctx, instance, "ClientDeployment", err)
	}
	if err := r.reconcileClientService(ctx, instance); err != nil {
		return r.setFailedStatus(ctx, instance, "ClientService", err)
	}

	// Step 5: Reconcile Ingress.
	if instance.Spec.Networking.Ingress.Enabled {
		if err := r.reconcileIngress(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "Ingress", err)
		}
	} else {
		if err := r.cleanupIngress(ctx, instance); err != nil {
			logger.Error(err, "failed to cleanup Ingress")
		}
	}

	// Step 6: Reconcile HPA.
	if instance.Spec.Autoscaling != nil && instance.Spec.Autoscaling.Enabled {
		if err := r.reconcileHPA(ctx, instance); err != nil {
			return r.setFailedStatus(ctx, instance, "HPA", err)
		}
	} else {
		if err := r.cleanupHPA(ctx, instance); err != nil {
			logger.Error(err, "failed to cleanup HPA")
		}
	}

	// Step 7: Update status.
	if err := r.updateStatus(ctx, instance); err != nil {
		logger.Error(err, "failed to update status")
		return ctrl.Result{}, err
	}

	return ctrl.Result{RequeueAfter: 30 * time.Second}, nil
}

// setFailedStatus updates the CR status to Failed and returns an error result.
func (r *GammaInstanceReconciler) setFailedStatus(ctx context.Context, instance *gammav1alpha1.GammaInstance, resource string, err error) (ctrl.Result, error) {
	logger := log.FromContext(ctx)
	logger.Error(err, "failed to reconcile resource", "resource", resource)

	instance.Status.Phase = "Failed"
	instance.Status.ObservedGeneration = instance.Generation
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
	if err := r.updateServerStatus(ctx, instance); err != nil {
		return err
	}
	if err := r.updateClientStatus(ctx, instance); err != nil {
		return err
	}
	if err := r.updateRedisStatus(ctx, instance); err != nil {
		return err
	}
	if err := r.updateTTSStatus(ctx, instance); err != nil {
		return err
	}

	instance.Status.Phase = computePhase(instance)
	instance.Status.ObservedGeneration = instance.Generation

	return r.Status().Update(ctx, instance)
}

func (r *GammaInstanceReconciler) updateServerStatus(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	deploy := &appsv1.Deployment{}
	name := serverName(instance)
	err := r.Get(ctx, types.NamespacedName{Name: name, Namespace: instance.Namespace}, deploy)
	if err != nil {
		if !errors.IsNotFound(err) {
			return err
		}
		instance.Status.ServerReadyReplicas = 0
		instance.Status.ServerEndpoint = ""
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "ServerReady",
			Status:             metav1.ConditionFalse,
			Reason:             "DeploymentMissing",
			Message:            "server deployment not found",
			LastTransitionTime: metav1.Now(),
		})
		return nil
	}

	instance.Status.ServerReadyReplicas = deploy.Status.ReadyReplicas
	instance.Status.ServerEndpoint = serviceEndpoint(instance, name, instance.Spec.Server.ServerPort())
	meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
		Type:               "ServerReady",
		Status:             conditionStatus(deploy.Status.ReadyReplicas >= instance.Spec.Server.ServerReplicas()),
		Reason:             "DeploymentStatus",
		Message:            fmt.Sprintf("%d/%d replicas ready", deploy.Status.ReadyReplicas, instance.Spec.Server.ServerReplicas()),
		LastTransitionTime: metav1.Now(),
	})

	return nil
}

func (r *GammaInstanceReconciler) updateClientStatus(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	deploy := &appsv1.Deployment{}
	name := clientName(instance)
	err := r.Get(ctx, types.NamespacedName{Name: name, Namespace: instance.Namespace}, deploy)
	if err != nil {
		if !errors.IsNotFound(err) {
			return err
		}
		instance.Status.ClientReadyReplicas = 0
		instance.Status.ClientEndpoint = ""
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "ClientReady",
			Status:             metav1.ConditionFalse,
			Reason:             "DeploymentMissing",
			Message:            "client deployment not found",
			LastTransitionTime: metav1.Now(),
		})
		return nil
	}

	instance.Status.ClientReadyReplicas = deploy.Status.ReadyReplicas
	instance.Status.ClientEndpoint = serviceEndpoint(instance, name, 80)
	meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
		Type:               "ClientReady",
		Status:             conditionStatus(deploy.Status.ReadyReplicas >= instance.Spec.Client.ClientReplicas()),
		Reason:             "DeploymentStatus",
		Message:            fmt.Sprintf("%d/%d replicas ready", deploy.Status.ReadyReplicas, instance.Spec.Client.ClientReplicas()),
		LastTransitionTime: metav1.Now(),
	})

	return nil
}

func (r *GammaInstanceReconciler) updateRedisStatus(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	if !instance.Spec.Redis.IsRedisEnabled() {
		instance.Status.RedisReady = false
		instance.Status.RedisEndpoint = ""
		removeCondition(&instance.Status.Conditions, "RedisReady")
		return nil
	}

	redisSts := &appsv1.StatefulSet{}
	name := redisName(instance)
	err := r.Get(ctx, types.NamespacedName{Name: name, Namespace: instance.Namespace}, redisSts)
	if err != nil {
		if !errors.IsNotFound(err) {
			return err
		}
		instance.Status.RedisReady = false
		instance.Status.RedisEndpoint = ""
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "RedisReady",
			Status:             metav1.ConditionFalse,
			Reason:             "StatefulSetMissing",
			Message:            "redis statefulset not found",
			LastTransitionTime: metav1.Now(),
		})
		return nil
	}

	instance.Status.RedisReady = redisSts.Status.ReadyReplicas > 0
	instance.Status.RedisEndpoint = serviceEndpoint(instance, name, 6379)
	meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
		Type:               "RedisReady",
		Status:             conditionStatus(redisSts.Status.ReadyReplicas > 0),
		Reason:             "StatefulSetStatus",
		Message:            fmt.Sprintf("%d/1 replicas ready", redisSts.Status.ReadyReplicas),
		LastTransitionTime: metav1.Now(),
	})

	return nil
}

func (r *GammaInstanceReconciler) updateTTSStatus(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	if !instance.Spec.TTS.IsTTSEnabled() {
		instance.Status.TTSReady = false
		instance.Status.TTSAPIReadyReplicas = 0
		instance.Status.TTSWorkerReadyReplicas = 0
		instance.Status.TTSMinIOReady = false
		instance.Status.TTSAPIEndpoint = ""
		instance.Status.TTSMinIOEndpoint = ""
		instance.Status.TTSMinIOConsoleEndpoint = ""
		removeCondition(&instance.Status.Conditions, "TTSAPIReady")
		removeCondition(&instance.Status.Conditions, "TTSWorkerReady")
		removeCondition(&instance.Status.Conditions, "TTSMinIOReady")
		removeCondition(&instance.Status.Conditions, "TTSReady")
		return nil
	}

	apiDeploy := &appsv1.Deployment{}
	apiName := ttsAPIName(instance)
	apiErr := r.Get(ctx, types.NamespacedName{Name: apiName, Namespace: instance.Namespace}, apiDeploy)
	if apiErr != nil {
		if !errors.IsNotFound(apiErr) {
			return apiErr
		}
		instance.Status.TTSAPIReadyReplicas = 0
		instance.Status.TTSAPIEndpoint = ""
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "TTSAPIReady",
			Status:             metav1.ConditionFalse,
			Reason:             "DeploymentMissing",
			Message:            "tts api deployment not found",
			LastTransitionTime: metav1.Now(),
		})
	} else {
		instance.Status.TTSAPIReadyReplicas = apiDeploy.Status.ReadyReplicas
		instance.Status.TTSAPIEndpoint = serviceURL(instance, apiName, instance.Spec.TTS.API.APIPort(), "http")
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "TTSAPIReady",
			Status:             conditionStatus(apiDeploy.Status.ReadyReplicas >= instance.Spec.TTS.API.APIReplicas()),
			Reason:             "DeploymentStatus",
			Message:            fmt.Sprintf("%d/%d replicas ready", apiDeploy.Status.ReadyReplicas, instance.Spec.TTS.API.APIReplicas()),
			LastTransitionTime: metav1.Now(),
		})
	}

	workerDeploy := &appsv1.Deployment{}
	workerName := ttsWorkerName(instance)
	workerErr := r.Get(ctx, types.NamespacedName{Name: workerName, Namespace: instance.Namespace}, workerDeploy)
	if workerErr != nil {
		if !errors.IsNotFound(workerErr) {
			return workerErr
		}
		instance.Status.TTSWorkerReadyReplicas = 0
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "TTSWorkerReady",
			Status:             metav1.ConditionFalse,
			Reason:             "DeploymentMissing",
			Message:            "tts worker deployment not found",
			LastTransitionTime: metav1.Now(),
		})
	} else {
		instance.Status.TTSWorkerReadyReplicas = workerDeploy.Status.ReadyReplicas
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "TTSWorkerReady",
			Status:             conditionStatus(workerDeploy.Status.ReadyReplicas >= instance.Spec.TTS.Worker.WorkerReplicas()),
			Reason:             "DeploymentStatus",
			Message:            fmt.Sprintf("%d/%d replicas ready", workerDeploy.Status.ReadyReplicas, instance.Spec.TTS.Worker.WorkerReplicas()),
			LastTransitionTime: metav1.Now(),
		})
	}

	minioDeploy := &appsv1.Deployment{}
	minioName := ttsMinIOName(instance)
	minioErr := r.Get(ctx, types.NamespacedName{Name: minioName, Namespace: instance.Namespace}, minioDeploy)
	if minioErr != nil {
		if !errors.IsNotFound(minioErr) {
			return minioErr
		}
		instance.Status.TTSMinIOReady = false
		instance.Status.TTSMinIOEndpoint = ""
		instance.Status.TTSMinIOConsoleEndpoint = ""
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "TTSMinIOReady",
			Status:             metav1.ConditionFalse,
			Reason:             "DeploymentMissing",
			Message:            "tts minio deployment not found",
			LastTransitionTime: metav1.Now(),
		})
	} else {
		instance.Status.TTSMinIOReady = minioDeploy.Status.ReadyReplicas > 0
		instance.Status.TTSMinIOEndpoint = serviceEndpoint(instance, minioName, instance.Spec.TTS.MinIO.Ports.APIPort())
		instance.Status.TTSMinIOConsoleEndpoint = serviceEndpoint(instance, minioName, instance.Spec.TTS.MinIO.Ports.ConsolePort())
		meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
			Type:               "TTSMinIOReady",
			Status:             conditionStatus(minioDeploy.Status.ReadyReplicas > 0),
			Reason:             "DeploymentStatus",
			Message:            fmt.Sprintf("%d/1 replicas ready", minioDeploy.Status.ReadyReplicas),
			LastTransitionTime: metav1.Now(),
		})
	}

	instance.Status.TTSReady = instance.Status.TTSAPIReadyReplicas >= instance.Spec.TTS.API.APIReplicas() &&
		instance.Status.TTSWorkerReadyReplicas >= instance.Spec.TTS.Worker.WorkerReplicas() &&
		instance.Status.TTSMinIOReady

	meta.SetStatusCondition(&instance.Status.Conditions, metav1.Condition{
		Type:               "TTSReady",
		Status:             conditionStatus(instance.Status.TTSReady),
		Reason:             "ComponentStatus",
		Message:            fmt.Sprintf("api=%d/%d worker=%d/%d minio=%t", instance.Status.TTSAPIReadyReplicas, instance.Spec.TTS.API.APIReplicas(), instance.Status.TTSWorkerReadyReplicas, instance.Spec.TTS.Worker.WorkerReplicas(), instance.Status.TTSMinIOReady),
		LastTransitionTime: metav1.Now(),
	})

	return nil
}

// computePhase determines the overall deployment phase.
func computePhase(instance *gammav1alpha1.GammaInstance) string {
	serverReady := instance.Status.ServerReadyReplicas >= instance.Spec.Server.ServerReplicas()
	clientReady := instance.Status.ClientReadyReplicas >= instance.Spec.Client.ClientReplicas()
	redisReady := !instance.Spec.Redis.IsRedisEnabled() || instance.Status.RedisReady
	ttsReady := !instance.Spec.TTS.IsTTSEnabled() || instance.Status.TTSReady

	if serverReady && clientReady && redisReady && ttsReady {
		return "Running"
	}

	if instance.Status.ServerReadyReplicas > 0 ||
		instance.Status.ClientReadyReplicas > 0 ||
		(instance.Spec.Redis.IsRedisEnabled() && instance.Status.RedisReady) ||
		(instance.Spec.TTS.IsTTSEnabled() && (instance.Status.TTSAPIReadyReplicas > 0 || instance.Status.TTSWorkerReadyReplicas > 0 || instance.Status.TTSMinIOReady)) {
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

func removeCondition(conditions *[]metav1.Condition, conditionType string) {
	if conditions == nil {
		return
	}
	filtered := (*conditions)[:0]
	for _, condition := range *conditions {
		if condition.Type != conditionType {
			filtered = append(filtered, condition)
		}
	}
	*conditions = filtered
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

func serverName(instance *gammav1alpha1.GammaInstance) string {
	return fmt.Sprintf("%s-server", instance.Name)
}

func clientName(instance *gammav1alpha1.GammaInstance) string {
	return fmt.Sprintf("%s-client", instance.Name)
}

func redisName(instance *gammav1alpha1.GammaInstance) string {
	return fmt.Sprintf("%s-redis", instance.Name)
}

func ttsAPIName(instance *gammav1alpha1.GammaInstance) string {
	return fmt.Sprintf("%s-tts-api", instance.Name)
}

func ttsWorkerName(instance *gammav1alpha1.GammaInstance) string {
	return fmt.Sprintf("%s-tts-worker", instance.Name)
}

func ttsMinIOName(instance *gammav1alpha1.GammaInstance) string {
	return fmt.Sprintf("%s-tts-minio", instance.Name)
}

func ttsMinIOPVCName(instance *gammav1alpha1.GammaInstance) string {
	return fmt.Sprintf("%s-tts-minio-data", instance.Name)
}

func serviceEndpoint(instance *gammav1alpha1.GammaInstance, serviceName string, port int32) string {
	return fmt.Sprintf("%s.%s.svc.cluster.local:%d", serviceName, instance.Namespace, port)
}

func serviceURL(instance *gammav1alpha1.GammaInstance, serviceName string, port int32, scheme string) string {
	return fmt.Sprintf("%s://%s", scheme, serviceEndpoint(instance, serviceName, port))
}

func redisServiceURL(instance *gammav1alpha1.GammaInstance) string {
	return fmt.Sprintf("redis://%s/0", serviceEndpoint(instance, redisName(instance), 6379))
}

func ttsAPIServiceURL(instance *gammav1alpha1.GammaInstance) string {
	return serviceURL(instance, ttsAPIName(instance), instance.Spec.TTS.API.APIPort(), "http")
}

func minioServiceEndpoint(instance *gammav1alpha1.GammaInstance) string {
	return serviceEndpoint(instance, ttsMinIOName(instance), instance.Spec.TTS.MinIO.Ports.APIPort())
}

// createOrUpdate is a helper that wraps controllerutil.CreateOrUpdate with owner references.
func (r *GammaInstanceReconciler) createOrUpdate(ctx context.Context, instance *gammav1alpha1.GammaInstance, obj client.Object, mutate func() error) error {
	if err := controllerutil.SetControllerReference(instance, obj, r.Scheme); err != nil {
		return fmt.Errorf("setting controller reference: %w", err)
	}
	_, err := controllerutil.CreateOrUpdate(ctx, r.Client, obj, mutate)
	return err
}

func (r *GammaInstanceReconciler) deleteResource(ctx context.Context, obj client.Object) error {
	if err := r.Delete(ctx, obj); err != nil && !errors.IsNotFound(err) {
		return err
	}
	return nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *GammaInstanceReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&gammav1alpha1.GammaInstance{}).
		Owns(&appsv1.Deployment{}).
		Owns(&appsv1.StatefulSet{}).
		Owns(&corev1.Service{}).
		Owns(&corev1.ConfigMap{}).
		Owns(&corev1.PersistentVolumeClaim{}).
		Owns(&networkingv1.Ingress{}).
		Owns(&autoscalingv2.HorizontalPodAutoscaler{}).
		Complete(r)
}
