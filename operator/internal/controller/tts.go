package controller

import (
	"context"
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/apimachinery/pkg/util/intstr"
	"sigs.k8s.io/controller-runtime/pkg/client"

	gammav1alpha1 "github.com/JUSTINWMYLES/gamma/operator/api/v1alpha1"
)

const (
	defaultTTSWorkerHealthFile          = "/tmp/gamma-tts-worker-health"
	defaultTTSWorkerHealthMaxAgeSeconds = "120"
)

// reconcileTTSAPIService ensures the TTS API service exists.
func (r *GammaInstanceReconciler) reconcileTTSAPIService(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	name := ttsAPIName(instance)
	port := instance.Spec.TTS.API.APIPort()

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, svc, func() error {
		svc.Labels = labelsForComponent(instance, "tts-api")
		svc.Spec = corev1.ServiceSpec{
			Type: corev1.ServiceTypeClusterIP,
			Ports: []corev1.ServicePort{
				{
					Name:       "http",
					Port:       port,
					TargetPort: intstr.FromInt32(port),
					Protocol:   corev1.ProtocolTCP,
				},
			},
			Selector: selectorLabelsForComponent(instance, "tts-api"),
		}
		return nil
	})
}

// reconcileTTSAPIDeployment ensures the TTS API deployment exists.
func (r *GammaInstanceReconciler) reconcileTTSAPIDeployment(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	name := ttsAPIName(instance)
	labels := labelsForComponent(instance, "tts-api")
	selectorLabels := selectorLabelsForComponent(instance, "tts-api")
	replicas := instance.Spec.TTS.API.APIReplicas()
	port := instance.Spec.TTS.API.APIPort()
	env := buildTTSEnv(instance, true)

	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, deploy, func() error {
		deploy.Labels = labels
		deploy.Spec = appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: selectorLabels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:      "tts-api",
							Image:     instance.Spec.TTS.API.APIImage(),
							Ports:     []corev1.ContainerPort{{Name: "http", ContainerPort: port, Protocol: corev1.ProtocolTCP}},
							Env:       env,
							Resources: instance.Spec.TTS.API.Resources,
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/healthz",
										Port: intstr.FromInt32(port),
									},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       10,
								TimeoutSeconds:      5,
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/healthz",
										Port: intstr.FromInt32(port),
									},
								},
								InitialDelaySeconds: 15,
								PeriodSeconds:       20,
							},
						},
					},
				},
			},
		}
		return nil
	})
}

// reconcileTTSWorkerDeployment ensures the TTS worker deployment exists.
func (r *GammaInstanceReconciler) reconcileTTSWorkerDeployment(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	name := ttsWorkerName(instance)
	labels := labelsForComponent(instance, "tts-worker")
	selectorLabels := selectorLabelsForComponent(instance, "tts-worker")
	replicas := instance.Spec.TTS.Worker.WorkerReplicas()
	env := buildTTSEnv(instance, false)

	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, deploy, func() error {
		deploy.Labels = labels
		deploy.Spec = appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: selectorLabels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:      "tts-worker",
							Image:     instance.Spec.TTS.Worker.WorkerImage(),
							Env:       env,
							Resources: instance.Spec.TTS.Worker.Resources,
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									Exec: &corev1.ExecAction{Command: []string{"python", "-c", "import os, sys, redis; redis.Redis.from_url(os.environ['REDIS_URL']).ping(); path = os.environ.get('TTS_WORKER_HEALTH_FILE'); sys.exit(0 if path and os.path.exists(path) else 1)"}},
								},
								InitialDelaySeconds: 10,
								PeriodSeconds:       20,
								TimeoutSeconds:      10,
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									Exec: &corev1.ExecAction{Command: []string{"python", "-c", "import os, sys, time; path = os.environ.get('TTS_WORKER_HEALTH_FILE'); max_age = float(os.environ.get('TTS_WORKER_HEALTH_MAX_AGE_SECONDS', '120')); healthy = path and os.path.exists(path) and (time.time() - os.path.getmtime(path)) <= max_age; sys.exit(0 if healthy else 1)"}},
								},
								InitialDelaySeconds: 60,
								PeriodSeconds:       30,
								TimeoutSeconds:      10,
							},
						},
					},
				},
			},
		}
		return nil
	})
}

func buildTTSEnv(instance *gammav1alpha1.GammaInstance, isAPI bool) []corev1.EnvVar {
	objectStoreEndpoint := objectStoreServiceEndpoint(instance)
	env := []corev1.EnvVar{
		{Name: "REDIS_URL", Value: redisServiceURL(instance)},
		{Name: "TTS_REDIS_KEY_PREFIX", Value: instance.Spec.TTS.Config.RedisKeyPrefixValue()},
		{Name: "MINIO_ENDPOINT", Value: objectStoreEndpoint},
		{Name: "MINIO_USE_SSL", Value: "false"},
		instance.Spec.TTS.ObjectStore.Credentials.AccessKeyEnvVar(),
		instance.Spec.TTS.ObjectStore.Credentials.SecretKeyEnvVar(),
		{Name: "MINIO_BUCKET_NAME", Value: instance.Spec.TTS.Config.BucketNameValue()},
		{Name: "TTS_MODEL_VERSION", Value: instance.Spec.TTS.Config.ModelVersionValue()},
		{Name: "TTS_VOICE_MANIFEST_PATH", Value: "/app/voices/manifest.json"},
	}

	// Rename the env var names for API/worker containers
	for i := range env {
		switch env[i].Name {
		case "WEED_S3_ACCESS_KEY":
			env[i].Name = "MINIO_ACCESS_KEY"
		case "WEED_S3_SECRET_KEY":
			env[i].Name = "MINIO_SECRET_KEY"
		}
	}

	if isAPI {
		env = append(env,
			corev1.EnvVar{Name: "PORT", Value: fmt.Sprintf("%d", instance.Spec.TTS.API.APIPort())},
			corev1.EnvVar{Name: "TTS_REQUIRE_WORKER_READY", Value: boolString(instance.Spec.TTS.Config.RequireWorkerReadyEnabled())},
			corev1.EnvVar{Name: "TTS_REQUIRE_CUSTOM_VOICE_PACK", Value: boolString(instance.Spec.TTS.Config.RequireCustomVoicePackEnabled())},
		)
	} else {
		env = append(env,
			corev1.EnvVar{Name: "TTS_LOG_LEVEL", Value: "INFO"},
			corev1.EnvVar{Name: "TTS_WORKER_HEALTH_FILE", Value: defaultTTSWorkerHealthFile},
			corev1.EnvVar{Name: "TTS_WORKER_HEALTH_MAX_AGE_SECONDS", Value: defaultTTSWorkerHealthMaxAgeSeconds},
			corev1.EnvVar{Name: "TTS_WARMUP_ENABLED", Value: "true"},
			corev1.EnvVar{Name: "TTS_WORKER_LEASE_DURATION", Value: "300s"},
		)
	}

	return env
}

func boolString(value bool) string {
	if value {
		return "true"
	}
	return "false"
}

// cleanupTTS removes TTS resources when tts.enabled is false.
func (r *GammaInstanceReconciler) cleanupTTS(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	objects := []clientObjectKey{
		{name: ttsWorkerName(instance), object: &appsv1.Deployment{}},
		{name: ttsAPIName(instance), object: &appsv1.Deployment{}},
		{name: ttsAPIName(instance), object: &corev1.Service{}},
		{name: ttsObjectStoreName(instance), object: &appsv1.Deployment{}},
		{name: ttsObjectStoreName(instance), object: &corev1.Service{}},
		{name: ttsObjectStorePVCName(instance), object: &corev1.PersistentVolumeClaim{}},
	}

	for _, item := range objects {
		if err := r.getAndDelete(ctx, instance.Namespace, item); err != nil {
			return err
		}
	}

	return nil
}

type clientObjectKey struct {
	name   string
	object client.Object
}

func (r *GammaInstanceReconciler) getAndDelete(ctx context.Context, namespace string, item clientObjectKey) error {
	err := r.Get(ctx, types.NamespacedName{Name: item.name, Namespace: namespace}, item.object)
	if errors.IsNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}
	return r.deleteResource(ctx, item.object)
}
