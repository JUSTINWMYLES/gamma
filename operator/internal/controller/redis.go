package controller

import (
	"context"
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"

	gammav1alpha1 "github.com/JUSTINWMYLES/gamma/operator/api/v1alpha1"
)

// reconcileRedisConfigMap ensures the Redis configuration ConfigMap exists.
func (r *GammaInstanceReconciler) reconcileRedisConfigMap(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	cm := &corev1.ConfigMap{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-redis-config", instance.Name),
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, cm, func() error {
		cm.Labels = labelsForComponent(instance, "redis")
		cm.Data = map[string]string{
			"redis.conf": fmt.Sprintf(`appendonly yes
appendfsync everysec
maxmemory %s
maxmemory-policy allkeys-lru
tcp-keepalive 60
timeout 300
`, instance.Spec.Redis.MaxMemoryValue()),
		}
		return nil
	})
}

// reconcileRedisStatefulSet ensures the Redis StatefulSet exists.
func (r *GammaInstanceReconciler) reconcileRedisStatefulSet(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	redisName := fmt.Sprintf("%s-redis", instance.Name)
	labels := labelsForComponent(instance, "redis")
	selectorLabels := selectorLabelsForComponent(instance, "redis")
	replicas := int32(1)

	sts := &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      redisName,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, sts, func() error {
		sts.Labels = labels
		sts.Spec = appsv1.StatefulSetSpec{
			Replicas:    &replicas,
			ServiceName: redisName,
			Selector: &metav1.LabelSelector{
				MatchLabels: selectorLabels,
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: labels,
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "redis",
							Image: instance.Spec.Redis.RedisImage(),
							Command: []string{
								"redis-server",
								"/usr/local/etc/redis/redis.conf",
							},
							Ports: []corev1.ContainerPort{
								{
									Name:          "redis",
									ContainerPort: 6379,
									Protocol:      corev1.ProtocolTCP,
								},
							},
							Resources: instance.Spec.Redis.Resources,
							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "data",
									MountPath: "/data",
								},
								{
									Name:      "config",
									MountPath: "/usr/local/etc/redis",
								},
							},
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									TCPSocket: &corev1.TCPSocketAction{
										Port: intstr.FromInt32(6379),
									},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       10,
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									TCPSocket: &corev1.TCPSocketAction{
										Port: intstr.FromInt32(6379),
									},
								},
								InitialDelaySeconds: 15,
								PeriodSeconds:       20,
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: "config",
							VolumeSource: corev1.VolumeSource{
								ConfigMap: &corev1.ConfigMapVolumeSource{
									LocalObjectReference: corev1.LocalObjectReference{
										Name: fmt.Sprintf("%s-redis-config", instance.Name),
									},
								},
							},
						},
					},
				},
			},
			VolumeClaimTemplates: []corev1.PersistentVolumeClaim{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "data",
					},
					Spec: corev1.PersistentVolumeClaimSpec{
						AccessModes: []corev1.PersistentVolumeAccessMode{
							corev1.ReadWriteOnce,
						},
						Resources: corev1.VolumeResourceRequirements{
							Requests: corev1.ResourceList{
								corev1.ResourceStorage: resource.MustParse(instance.Spec.Redis.Storage.RedisStorageSize()),
							},
						},
					},
				},
			},
		}

		// Set storage class if specified.
		if instance.Spec.Redis.Storage.StorageClassName != "" {
			sc := instance.Spec.Redis.Storage.StorageClassName
			sts.Spec.VolumeClaimTemplates[0].Spec.StorageClassName = &sc
		}

		return nil
	})
}

// reconcileRedisService ensures the Redis headless Service exists.
func (r *GammaInstanceReconciler) reconcileRedisService(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	redisName := fmt.Sprintf("%s-redis", instance.Name)
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      redisName,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, svc, func() error {
		svc.Labels = labelsForComponent(instance, "redis")
		svc.Spec = corev1.ServiceSpec{
			ClusterIP: corev1.ClusterIPNone, // Headless
			Ports: []corev1.ServicePort{
				{
					Name:       "redis",
					Port:       6379,
					TargetPort: intstr.FromInt32(6379),
					Protocol:   corev1.ProtocolTCP,
				},
			},
			Selector: selectorLabelsForComponent(instance, "redis"),
		}
		return nil
	})
}
