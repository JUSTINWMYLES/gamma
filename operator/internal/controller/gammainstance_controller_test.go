package controller

import (
	"context"
	"fmt"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	appsv1 "k8s.io/api/apps/v1"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	crclient "sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/client/fake"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"

	gammav1alpha1 "github.com/gamma/gamma-operator/api/v1alpha1"
)

func newScheme() *runtime.Scheme {
	s := runtime.NewScheme()
	_ = clientgoscheme.AddToScheme(s)
	_ = gammav1alpha1.AddToScheme(s)
	return s
}

func boolPtr(b bool) *bool       { return &b }
func int32Ptr(i int32) *int32    { return &i }

func newTestInstance(name, namespace string) *gammav1alpha1.GammaInstance {
	return &gammav1alpha1.GammaInstance{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: namespace,
			UID:       "test-uid-123",
		},
		Spec: gammav1alpha1.GammaInstanceSpec{
			Server: gammav1alpha1.ServerSpec{
				Image:    "ghcr.io/gamma/gamma-server:latest",
				Replicas: int32Ptr(2),
				Port:     2567,
			},
			Client: gammav1alpha1.ClientSpec{
				Image:    "ghcr.io/gamma/gamma-client:latest",
				Replicas: int32Ptr(2),
			},
			Redis: gammav1alpha1.RedisSpec{
				Enabled: boolPtr(true),
			},
		},
	}
}

func TestReconcile_CreatesServerDeployment(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	// Verify server deployment was created.
	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-server", Namespace: "default"}, deploy)
	require.NoError(t, err)

	assert.Equal(t, "ghcr.io/gamma/gamma-server:latest", deploy.Spec.Template.Spec.Containers[0].Image)
	assert.Equal(t, int32(2), *deploy.Spec.Replicas)
	assert.Equal(t, int32(2567), deploy.Spec.Template.Spec.Containers[0].Ports[0].ContainerPort)
}

func TestReconcile_CreatesServerServiceWithStickySession(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	svc := &corev1.Service{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-server", Namespace: "default"}, svc)
	require.NoError(t, err)

	assert.Equal(t, corev1.ServiceAffinityClientIP, svc.Spec.SessionAffinity)
	require.NotNil(t, svc.Spec.SessionAffinityConfig)
	require.NotNil(t, svc.Spec.SessionAffinityConfig.ClientIP)
	assert.Equal(t, int32(3600), *svc.Spec.SessionAffinityConfig.ClientIP.TimeoutSeconds)
}

func TestReconcile_CreatesClientDeployment(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-client", Namespace: "default"}, deploy)
	require.NoError(t, err)

	assert.Equal(t, "ghcr.io/gamma/gamma-client:latest", deploy.Spec.Template.Spec.Containers[0].Image)
	assert.Equal(t, int32(2), *deploy.Spec.Replicas)

	// Verify VITE_SERVER_URL env var.
	found := false
	for _, env := range deploy.Spec.Template.Spec.Containers[0].Env {
		if env.Name == "VITE_SERVER_URL" {
			found = true
			assert.Contains(t, env.Value, "my-gamma-server")
		}
	}
	assert.True(t, found, "VITE_SERVER_URL env var should be set")
}

func TestReconcile_CreatesRedisResources(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	// Verify Redis ConfigMap.
	cm := &corev1.ConfigMap{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-redis-config", Namespace: "default"}, cm)
	require.NoError(t, err)
	assert.Contains(t, cm.Data["redis.conf"], "appendonly yes")

	// Verify Redis StatefulSet.
	sts := &appsv1.StatefulSet{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-redis", Namespace: "default"}, sts)
	require.NoError(t, err)
	assert.Equal(t, "redis:7-alpine", sts.Spec.Template.Spec.Containers[0].Image)
	assert.Equal(t, int32(1), *sts.Spec.Replicas)

	// Verify Redis headless Service.
	svc := &corev1.Service{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-redis", Namespace: "default"}, svc)
	require.NoError(t, err)
	assert.Equal(t, corev1.ClusterIPNone, svc.Spec.ClusterIP)
}

func TestReconcile_SkipsRedisWhenDisabled(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Redis.Enabled = boolPtr(false)

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	// Redis StatefulSet should NOT exist.
	sts := &appsv1.StatefulSet{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-redis", Namespace: "default"}, sts)
	assert.True(t, err != nil, "Redis StatefulSet should not exist when disabled")
}

func TestReconcile_InjectsRedisEnvVars(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Redis.Enabled = boolPtr(true)

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-server", Namespace: "default"}, deploy)
	require.NoError(t, err)

	envMap := map[string]string{}
	for _, env := range deploy.Spec.Template.Spec.Containers[0].Env {
		envMap[env.Name] = env.Value
	}
	assert.Equal(t, "redis", envMap["STATE_BACKEND"])
	assert.Contains(t, envMap["REDIS_URL"], "redis://my-gamma-redis")
}

func TestReconcile_InjectsMemoryBackendWhenRedisDisabled(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Redis.Enabled = boolPtr(false)

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-server", Namespace: "default"}, deploy)
	require.NoError(t, err)

	envMap := map[string]string{}
	for _, env := range deploy.Spec.Template.Spec.Containers[0].Env {
		envMap[env.Name] = env.Value
	}
	assert.Equal(t, "memory", envMap["STATE_BACKEND"])
	_, hasRedisURL := envMap["REDIS_URL"]
	assert.False(t, hasRedisURL, "REDIS_URL should not be set when Redis is disabled")
}

func TestReconcile_CreatesHPAWhenAutoscalingEnabled(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Autoscaling = &gammav1alpha1.AutoscalingSpec{
		Enabled:                        true,
		MinReplicas:                    2,
		MaxReplicas:                    10,
		TargetCPUUtilizationPercentage: 70,
	}

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	hpa := &autoscalingv2.HorizontalPodAutoscaler{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-server", Namespace: "default"}, hpa)
	require.NoError(t, err)

	assert.Equal(t, int32(2), *hpa.Spec.MinReplicas)
	assert.Equal(t, int32(10), hpa.Spec.MaxReplicas)
	assert.Equal(t, "my-gamma-server", hpa.Spec.ScaleTargetRef.Name)
}

func TestReconcile_DoesNotCreateHPAWhenAutoscalingDisabled(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")
	// Autoscaling is nil by default.

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	hpa := &autoscalingv2.HorizontalPodAutoscaler{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-server", Namespace: "default"}, hpa)
	assert.True(t, err != nil, "HPA should not exist when autoscaling is disabled")
}

func TestReconcile_DoesNotSetReplicasWhenAutoscalingEnabled(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Autoscaling = &gammav1alpha1.AutoscalingSpec{
		Enabled:     true,
		MinReplicas: 1,
		MaxReplicas: 5,
	}

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-server", Namespace: "default"}, deploy)
	require.NoError(t, err)

	// When autoscaling is enabled, replicas should NOT be set (let HPA manage).
	assert.Nil(t, deploy.Spec.Replicas, "Server deployment should not set replicas when HPA is active")
}

func TestReconcile_CreatesIngressWhenEnabled(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Networking.Ingress = gammav1alpha1.IngressSpec{
		Enabled:   true,
		ClassName: "nginx",
		Host:      "gamma.example.com",
	}

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	ingress := &networkingv1.Ingress{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma", Namespace: "default"}, ingress)
	require.NoError(t, err)

	assert.Equal(t, "nginx", *ingress.Spec.IngressClassName)
	assert.Equal(t, "gamma.example.com", ingress.Spec.Rules[0].Host)
	require.Len(t, ingress.Spec.Rules[0].HTTP.Paths, 2)
	assert.Equal(t, "/ws", ingress.Spec.Rules[0].HTTP.Paths[0].Path)
	assert.Equal(t, "/", ingress.Spec.Rules[0].HTTP.Paths[1].Path)

	// Verify sticky session annotations.
	assert.Equal(t, "cookie", ingress.Annotations["nginx.ingress.kubernetes.io/affinity"])
	assert.Equal(t, "3600", ingress.Annotations["nginx.ingress.kubernetes.io/proxy-read-timeout"])
}

func TestReconcile_DoesNotCreateIngressWhenDisabled(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")
	// Ingress is disabled by default.

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	ingress := &networkingv1.Ingress{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma", Namespace: "default"}, ingress)
	assert.True(t, err != nil, "Ingress should not exist when disabled")
}

func TestReconcile_HandlesDeletedInstance(t *testing.T) {
	s := newScheme()
	// Instance does NOT exist.
	client := fake.NewClientBuilder().WithScheme(s).Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	result, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "deleted-instance", Namespace: "default"},
	})
	require.NoError(t, err)
	assert.Equal(t, reconcile.Result{}, result)
}

func TestReconcile_SetsLabelsCorrectly(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-server", Namespace: "default"}, deploy)
	require.NoError(t, err)

	assert.Equal(t, "gamma", deploy.Labels["app.kubernetes.io/name"])
	assert.Equal(t, "my-gamma", deploy.Labels["app.kubernetes.io/instance"])
	assert.Equal(t, "server", deploy.Labels["app.kubernetes.io/component"])
	assert.Equal(t, "gamma-operator", deploy.Labels["app.kubernetes.io/managed-by"])
	assert.Equal(t, "my-gamma", deploy.Labels["gamma.io/instance"])
}

func TestReconcile_ServerDeploymentHasPreStopHook(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-server", Namespace: "default"}, deploy)
	require.NoError(t, err)

	container := deploy.Spec.Template.Spec.Containers[0]
	require.NotNil(t, container.Lifecycle)
	require.NotNil(t, container.Lifecycle.PreStop)
	assert.Equal(t, []string{"sh", "-c", "sleep 15"}, container.Lifecycle.PreStop.Exec.Command)
	assert.Equal(t, int64(60), *deploy.Spec.Template.Spec.TerminationGracePeriodSeconds)
}

func TestReconcile_ServerDeploymentHasPodAntiAffinity(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	deploy := &appsv1.Deployment{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma-server", Namespace: "default"}, deploy)
	require.NoError(t, err)

	require.NotNil(t, deploy.Spec.Template.Spec.Affinity)
	require.NotNil(t, deploy.Spec.Template.Spec.Affinity.PodAntiAffinity)
	assert.Len(t, deploy.Spec.Template.Spec.Affinity.PodAntiAffinity.PreferredDuringSchedulingIgnoredDuringExecution, 1)
}

func TestReconcile_IngressWithTLS(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Networking.Ingress = gammav1alpha1.IngressSpec{
		Enabled:   true,
		ClassName: "nginx",
		Host:      "gamma.example.com",
		TLS: gammav1alpha1.IngressTLSSpec{
			Enabled:    true,
			SecretName: "gamma-tls",
		},
	}

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	ingress := &networkingv1.Ingress{}
	err = client.Get(context.Background(), types.NamespacedName{Name: "my-gamma", Namespace: "default"}, ingress)
	require.NoError(t, err)

	require.Len(t, ingress.Spec.TLS, 1)
	assert.Equal(t, "gamma-tls", ingress.Spec.TLS[0].SecretName)
	assert.Contains(t, ingress.Spec.TLS[0].Hosts, "gamma.example.com")
}

func TestHelpers_DefaultValues(t *testing.T) {
	// Test ServerSpec defaults.
	serverSpec := gammav1alpha1.ServerSpec{}
	assert.Equal(t, int32(1), serverSpec.ServerReplicas())
	assert.Equal(t, int32(2567), serverSpec.ServerPort())

	serverSpec.Replicas = int32Ptr(3)
	serverSpec.Port = 8080
	assert.Equal(t, int32(3), serverSpec.ServerReplicas())
	assert.Equal(t, int32(8080), serverSpec.ServerPort())

	// Test ClientSpec defaults.
	clientSpec := gammav1alpha1.ClientSpec{}
	assert.Equal(t, int32(1), clientSpec.ClientReplicas())

	clientSpec.Replicas = int32Ptr(5)
	assert.Equal(t, int32(5), clientSpec.ClientReplicas())

	// Test RedisSpec defaults.
	redisSpec := gammav1alpha1.RedisSpec{}
	assert.True(t, redisSpec.IsRedisEnabled())
	assert.Equal(t, "redis:7-alpine", redisSpec.RedisImage())

	redisSpec.Enabled = boolPtr(false)
	assert.False(t, redisSpec.IsRedisEnabled())

	redisSpec.Image = "redis:6"
	assert.Equal(t, "redis:6", redisSpec.RedisImage())

	// Test RedisStorageSpec defaults.
	storageSpec := gammav1alpha1.RedisStorageSpec{}
	assert.Equal(t, "1Gi", storageSpec.RedisStorageSize())

	storageSpec.Size = "5Gi"
	assert.Equal(t, "5Gi", storageSpec.RedisStorageSize())
}

func TestBuildServerEnv_RedisEnabled(t *testing.T) {
	instance := newTestInstance("my-gamma", "test-ns")
	instance.Spec.Redis.Enabled = boolPtr(true)
	instance.Spec.Server.Env = []corev1.EnvVar{
		{Name: "LOG_LEVEL", Value: "debug"},
	}

	env := buildServerEnv(instance)

	envMap := map[string]string{}
	for _, e := range env {
		envMap[e.Name] = e.Value
	}
	assert.Equal(t, "redis", envMap["STATE_BACKEND"])
	assert.Equal(t, "redis://my-gamma-redis.test-ns.svc.cluster.local:6379", envMap["REDIS_URL"])
	assert.Equal(t, "debug", envMap["LOG_LEVEL"])
}

func TestBuildServerEnv_RedisDisabled(t *testing.T) {
	instance := newTestInstance("my-gamma", "test-ns")
	instance.Spec.Redis.Enabled = boolPtr(false)

	env := buildServerEnv(instance)

	envMap := map[string]string{}
	for _, e := range env {
		envMap[e.Name] = e.Value
	}
	assert.Equal(t, "memory", envMap["STATE_BACKEND"])
	_, hasRedisURL := envMap["REDIS_URL"]
	assert.False(t, hasRedisURL)
}

func TestLabelsForComponent(t *testing.T) {
	instance := &gammav1alpha1.GammaInstance{
		ObjectMeta: metav1.ObjectMeta{Name: "test-gamma"},
	}

	labels := labelsForComponent(instance, "server")
	assert.Equal(t, "gamma", labels["app.kubernetes.io/name"])
	assert.Equal(t, "test-gamma", labels["app.kubernetes.io/instance"])
	assert.Equal(t, "server", labels["app.kubernetes.io/component"])
	assert.Equal(t, "gamma-operator", labels["app.kubernetes.io/managed-by"])
	assert.Equal(t, "test-gamma", labels["gamma.io/instance"])
}

func TestComputePhase(t *testing.T) {
	tests := []struct {
		name     string
		setup    func(*gammav1alpha1.GammaInstance)
		expected string
	}{
		{
			name: "all ready",
			setup: func(gi *gammav1alpha1.GammaInstance) {
				gi.Status.ServerReadyReplicas = 2
				gi.Status.ClientReadyReplicas = 2
				gi.Status.RedisReady = true
			},
			expected: "Running",
		},
		{
			name: "some replicas ready",
			setup: func(gi *gammav1alpha1.GammaInstance) {
				gi.Status.ServerReadyReplicas = 1
				gi.Status.ClientReadyReplicas = 0
			},
			expected: "Degraded",
		},
		{
			name: "no replicas ready",
			setup: func(gi *gammav1alpha1.GammaInstance) {
				gi.Status.ServerReadyReplicas = 0
				gi.Status.ClientReadyReplicas = 0
			},
			expected: "Deploying",
		},
		{
			name: "redis disabled and all else ready",
			setup: func(gi *gammav1alpha1.GammaInstance) {
				gi.Spec.Redis.Enabled = boolPtr(false)
				gi.Status.ServerReadyReplicas = 2
				gi.Status.ClientReadyReplicas = 2
				gi.Status.RedisReady = false
			},
			expected: "Running",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gi := newTestInstance("test", "default")
			tt.setup(gi)
			assert.Equal(t, tt.expected, computePhase(gi))
		})
	}
}

func TestReconcile_AppliesToCorrectNamespace(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "production")

	client := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: client, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "production"},
	})
	require.NoError(t, err)

	// Verify resources are in the correct namespace.
	type namedObj struct {
		name string
		obj  crclient.Object
	}
	resources := []namedObj{
		{"my-gamma-server", &appsv1.Deployment{}},
		{"my-gamma-client", &appsv1.Deployment{}},
		{"my-gamma-server", &corev1.Service{}},
		{"my-gamma-client", &corev1.Service{}},
		{"my-gamma-redis", &appsv1.StatefulSet{}},
		{"my-gamma-redis", &corev1.Service{}},
		{"my-gamma-redis-config", &corev1.ConfigMap{}},
	}

	for _, res := range resources {
		t.Run(fmt.Sprintf("%T/%s", res.obj, res.name), func(t *testing.T) {
			err := client.Get(context.Background(), types.NamespacedName{
				Name: res.name, Namespace: "production",
			}, res.obj)
			assert.NoError(t, err, "resource %s should exist in production namespace", res.name)
		})
	}
}

func TestBuildServerEnv_SecretEnvVars(t *testing.T) {
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Server.SecretEnvVars = []gammav1alpha1.SecretEnvVar{
		{
			Name:       "GIPHY_API_KEY",
			SecretName: "giphy-secret",
			SecretKey:  "api-key",
		},
		{
			Name:       "TENOR_API_KEY",
			SecretName: "tenor-secret",
			SecretKey:  "key",
		},
	}

	env := buildServerEnv(instance)

	// Find the secret-sourced env vars.
	secretEnvs := map[string]*corev1.EnvVarSource{}
	for _, e := range env {
		if e.ValueFrom != nil {
			secretEnvs[e.Name] = e.ValueFrom
		}
	}

	require.Contains(t, secretEnvs, "GIPHY_API_KEY")
	giphyRef := secretEnvs["GIPHY_API_KEY"].SecretKeyRef
	require.NotNil(t, giphyRef)
	assert.Equal(t, "giphy-secret", giphyRef.Name)
	assert.Equal(t, "api-key", giphyRef.Key)

	require.Contains(t, secretEnvs, "TENOR_API_KEY")
	tenorRef := secretEnvs["TENOR_API_KEY"].SecretKeyRef
	require.NotNil(t, tenorRef)
	assert.Equal(t, "tenor-secret", tenorRef.Name)
	assert.Equal(t, "key", tenorRef.Key)
}

func TestReconcile_InjectsSecretEnvVarsIntoServerDeployment(t *testing.T) {
	s := newScheme()
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Server.SecretEnvVars = []gammav1alpha1.SecretEnvVar{
		{
			Name:       "GIPHY_API_KEY",
			SecretName: "giphy-secret",
			SecretKey:  "api-key",
		},
	}

	cl := fake.NewClientBuilder().WithScheme(s).
		WithObjects(instance).
		WithStatusSubresource(instance).
		Build()

	r := &GammaInstanceReconciler{Client: cl, Scheme: s}

	_, err := r.Reconcile(context.Background(), reconcile.Request{
		NamespacedName: types.NamespacedName{Name: "my-gamma", Namespace: "default"},
	})
	require.NoError(t, err)

	deploy := &appsv1.Deployment{}
	err = cl.Get(context.Background(), types.NamespacedName{Name: "my-gamma-server", Namespace: "default"}, deploy)
	require.NoError(t, err)

	found := false
	for _, env := range deploy.Spec.Template.Spec.Containers[0].Env {
		if env.Name == "GIPHY_API_KEY" {
			found = true
			require.NotNil(t, env.ValueFrom)
			require.NotNil(t, env.ValueFrom.SecretKeyRef)
			assert.Equal(t, "giphy-secret", env.ValueFrom.SecretKeyRef.Name)
			assert.Equal(t, "api-key", env.ValueFrom.SecretKeyRef.Key)
		}
	}
	assert.True(t, found, "GIPHY_API_KEY secret env var should be injected into server deployment")
}

func TestBuildServerEnv_OTELEnabled(t *testing.T) {
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Observability = gammav1alpha1.ObservabilitySpec{
		Enabled:      boolPtr(true),
		OTLPEndpoint: "http://otel-collector.monitoring.svc:4318",
		ServiceName:  "my-gamma-server",
	}

	env := buildServerEnv(instance)

	envMap := map[string]string{}
	for _, e := range env {
		if e.Value != "" {
			envMap[e.Name] = e.Value
		}
	}

	assert.Equal(t, "true", envMap["OTEL_ENABLED"])
	assert.Equal(t, "http://otel-collector.monitoring.svc:4318", envMap["OTEL_EXPORTER_OTLP_ENDPOINT"])
	assert.Equal(t, "my-gamma-server", envMap["OTEL_SERVICE_NAME"])
}

func TestBuildServerEnv_OTELDisabled(t *testing.T) {
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Observability = gammav1alpha1.ObservabilitySpec{
		Enabled: boolPtr(false),
	}

	env := buildServerEnv(instance)

	envMap := map[string]string{}
	for _, e := range env {
		envMap[e.Name] = e.Value
	}

	assert.Equal(t, "false", envMap["OTEL_ENABLED"])
	_, hasEndpoint := envMap["OTEL_EXPORTER_OTLP_ENDPOINT"]
	assert.False(t, hasEndpoint, "OTEL_EXPORTER_OTLP_ENDPOINT should not be set when OTEL is disabled")
}

func TestBuildServerEnv_OTELNotConfigured(t *testing.T) {
	// When observability is not configured, no OTEL_* env vars should be injected.
	instance := newTestInstance("my-gamma", "default")
	// instance.Spec.Observability is zero-value (Enabled == nil)

	env := buildServerEnv(instance)

	for _, e := range env {
		assert.False(t, e.Name == "OTEL_ENABLED" || e.Name == "OTEL_EXPORTER_OTLP_ENDPOINT" || e.Name == "OTEL_SERVICE_NAME",
			"OTEL env var %s should not be injected when observability is not configured", e.Name)
	}
}

func TestBuildServerEnv_OTELEnabledWithoutEndpoint(t *testing.T) {
	// Enabled=true but no endpoint/serviceName — only OTEL_ENABLED should be injected.
	instance := newTestInstance("my-gamma", "default")
	instance.Spec.Observability = gammav1alpha1.ObservabilitySpec{
		Enabled: boolPtr(true),
	}

	env := buildServerEnv(instance)

	envMap := map[string]string{}
	for _, e := range env {
		envMap[e.Name] = e.Value
	}

	assert.Equal(t, "true", envMap["OTEL_ENABLED"])
	_, hasEndpoint := envMap["OTEL_EXPORTER_OTLP_ENDPOINT"]
	assert.False(t, hasEndpoint, "OTEL_EXPORTER_OTLP_ENDPOINT should not be set when endpoint is not configured")
	_, hasServiceName := envMap["OTEL_SERVICE_NAME"]
	assert.False(t, hasServiceName, "OTEL_SERVICE_NAME should not be set when service name is not configured")
}
