package controller

import (
	"context"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"

	gammav1alpha1 "github.com/JUSTINWMYLES/gamma/operator/api/v1alpha1"
)

// reconcileServerDeployment ensures the server Deployment exists and matches the desired state.
func (r *GammaInstanceReconciler) reconcileServerDeployment(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	serverName := serverName(instance)
	labels := labelsForComponent(instance, "server")
	selectorLabels := selectorLabelsForComponent(instance, "server")
	replicas := instance.Spec.Server.ServerReplicas()
	port := instance.Spec.Server.ServerPort()

	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      serverName,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, deploy, func() error {
		deploy.Labels = labels

		// Build environment variables.
		env := buildServerEnv(instance)

		// Colyseus rooms are pod-local — scaling beyond 1 replica causes
		// "seat reservation expired" errors because WebSocket connections
		// may land on a pod that does not host the room.
		// Without a @colyseus/proxy layer for room-aware routing, we must
		// hard-cap replicas at 1.
		if !hasColyseusProxy(instance) {
			replicas = 1
		}

		// When autoscaling is active, do not set replicas (let HPA manage it).
		var replicaPtr *int32
		if instance.Spec.Autoscaling == nil || !instance.Spec.Autoscaling.Enabled {
			replicaPtr = &replicas
		}

		maxUnavailable := intstr.FromInt32(0)
		maxSurge := intstr.FromInt32(1)

		deploy.Spec = appsv1.DeploymentSpec{
			Replicas: replicaPtr,
			Selector: &metav1.LabelSelector{
				MatchLabels: selectorLabels,
			},
			Strategy: appsv1.DeploymentStrategy{
				Type: appsv1.RollingUpdateDeploymentStrategyType,
				RollingUpdate: &appsv1.RollingUpdateDeployment{
					MaxUnavailable: &maxUnavailable,
					MaxSurge:       &maxSurge,
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: labels,
				},
				Spec: corev1.PodSpec{
					TerminationGracePeriodSeconds: int64Ptr(60),
					Containers: []corev1.Container{
						{
							Name:  "server",
							Image: instance.Spec.Server.Image,
							Ports: []corev1.ContainerPort{
								{
									Name:          "ws",
									ContainerPort: port,
									Protocol:      corev1.ProtocolTCP,
								},
							},
							Env:       env,
							Resources: instance.Spec.Server.Resources,
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/health",
										Port: intstr.FromInt32(port),
									},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       10,
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/health",
										Port: intstr.FromInt32(port),
									},
								},
								InitialDelaySeconds: 15,
								PeriodSeconds:       20,
							},
							Lifecycle: &corev1.Lifecycle{
								PreStop: &corev1.LifecycleHandler{
									Exec: &corev1.ExecAction{
										Command: []string{"sh", "-c", "sleep 15"},
									},
								},
							},
						},
					},
					Affinity: &corev1.Affinity{
						PodAntiAffinity: &corev1.PodAntiAffinity{
							PreferredDuringSchedulingIgnoredDuringExecution: []corev1.WeightedPodAffinityTerm{
								{
									Weight: 100,
									PodAffinityTerm: corev1.PodAffinityTerm{
										LabelSelector: &metav1.LabelSelector{
											MatchLabels: selectorLabels,
										},
										TopologyKey: "kubernetes.io/hostname",
									},
								},
							},
						},
					},
				},
			},
		}
		return nil
	})
}

// buildServerEnv constructs the environment variable list for the server container.
func buildServerEnv(instance *gammav1alpha1.GammaInstance) []corev1.EnvVar {
	var env []corev1.EnvVar

	if instance.Spec.Redis.IsRedisEnabled() {
		redisURL := redisServiceURL(instance)
		env = append(env,
			corev1.EnvVar{Name: "STATE_BACKEND", Value: "redis"},
			corev1.EnvVar{Name: "REDIS_URL", Value: redisURL},
		)
	} else {
		env = append(env,
			corev1.EnvVar{Name: "STATE_BACKEND", Value: "memory"},
		)
	}

	// Colyseus seat reservations are stored in local memory per-pod.
	// When scaling to multiple replicas, clients must reach the same pod
	// for both matchmaking HTTP and WebSocket upgrade. A longer timeout
	// provides a safety margin for network latency and sticky-session
	// propagation.
	env = append(env,
		corev1.EnvVar{Name: "COLYSEUS_SEAT_RESERVATION_TIME", Value: "60"},
	)

	// Inject OTEL environment variables when observability is explicitly configured.
	obs := instance.Spec.Observability
	if obs.Enabled != nil {
		if *obs.Enabled {
			env = append(env, corev1.EnvVar{Name: "OTEL_ENABLED", Value: "true"})
			if obs.OTLPEndpoint != "" {
				env = append(env, corev1.EnvVar{Name: "OTEL_EXPORTER_OTLP_ENDPOINT", Value: obs.OTLPEndpoint})
			}
			if obs.ServiceName != "" {
				env = append(env, corev1.EnvVar{Name: "OTEL_SERVICE_NAME", Value: obs.ServiceName})
			}
		} else {
			env = append(env, corev1.EnvVar{Name: "OTEL_ENABLED", Value: "false"})
		}
	}

	if instance.Spec.TTS.IsTTSEnabled() {
		env = append(env, corev1.EnvVar{Name: "TTS_API_URL", Value: ttsAPIServiceURL(instance)})
	}

	if instance.Spec.AudioOverlay.UsesObjectStore() {
		credentials := instance.Spec.TTS.ObjectStore.Credentials
		env = append(env,
			corev1.EnvVar{Name: "AUDIO_OVERLAY_OBJECT_STORE_ENDPOINT", Value: objectStoreServiceEndpoint(instance)},
			corev1.EnvVar{Name: "AUDIO_OVERLAY_OBJECT_STORE_USE_SSL", Value: "false"},
			credentials.AccessKeyEnvVar(),
			credentials.SecretKeyEnvVar(),
			corev1.EnvVar{Name: "AUDIO_OVERLAY_OBJECT_STORE_BUCKET", Value: instance.Spec.AudioOverlay.ObjectStore.BucketNameValue()},
			corev1.EnvVar{Name: "AUDIO_OVERLAY_OBJECT_STORE_PREFIX", Value: instance.Spec.AudioOverlay.ObjectStore.PrefixValue()},
		)

		for i := range env {
			switch env[i].Name {
			case "WEED_S3_ACCESS_KEY":
				env[i].Name = "AUDIO_OVERLAY_OBJECT_STORE_ACCESS_KEY"
			case "WEED_S3_SECRET_KEY":
				env[i].Name = "AUDIO_OVERLAY_OBJECT_STORE_SECRET_KEY"
			}
		}
	}

	// Append user-supplied env vars.
	env = append(env, instance.Spec.Server.Env...)

	// Append secret-sourced env vars (e.g. third-party API keys).
	for _, s := range instance.Spec.Server.SecretEnvVars {
		env = append(env, corev1.EnvVar{
			Name: s.Name,
			ValueFrom: &corev1.EnvVarSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: corev1.LocalObjectReference{
						Name: s.SecretName,
					},
					Key: s.SecretKey,
				},
			},
		})
	}

	return env
}

// reconcileServerService ensures the server Service exists with sticky sessions.
func (r *GammaInstanceReconciler) reconcileServerService(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	serverName := serverName(instance)
	port := instance.Spec.Server.ServerPort()
	timeoutSeconds := int32(3600)

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      serverName,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, svc, func() error {
		svc.Labels = labelsForComponent(instance, "server")
		svc.Spec = corev1.ServiceSpec{
			Type:            corev1.ServiceTypeClusterIP,
			SessionAffinity: corev1.ServiceAffinityClientIP,
			SessionAffinityConfig: &corev1.SessionAffinityConfig{
				ClientIP: &corev1.ClientIPConfig{
					TimeoutSeconds: &timeoutSeconds,
				},
			},
			Ports: []corev1.ServicePort{
				{
					Name:       "ws",
					Port:       port,
					TargetPort: intstr.FromInt32(port),
					Protocol:   corev1.ProtocolTCP,
				},
			},
			Selector: selectorLabelsForComponent(instance, "server"),
		}
		return nil
	})
}

func int64Ptr(i int64) *int64 {
	return &i
}

// hasColyseusProxy returns true when the GammaInstance spec indicates a
// @colyseus/proxy layer is deployed, which enables room-aware routing
// across multiple server pods.
func hasColyseusProxy(instance *gammav1alpha1.GammaInstance) bool {
	if instance.Spec.Server.Annotations == nil {
		return false
	}
	_, ok := instance.Spec.Server.Annotations["gamma.io/colyseus-proxy"]
	return ok
}
