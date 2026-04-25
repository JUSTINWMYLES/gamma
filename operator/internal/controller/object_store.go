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

// reconcileObjectStorePVC ensures the object store PVC exists.
func (r *GammaInstanceReconciler) reconcileObjectStorePVC(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ttsObjectStorePVCName(instance),
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, pvc, func() error {
		pvc.Labels = labelsForComponent(instance, "tts-object-store")
		pvc.Spec = corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse(instance.Spec.TTS.ObjectStore.Storage.StorageSize()),
				},
			},
		}
		if instance.Spec.TTS.ObjectStore.Storage.StorageClassName != "" {
			sc := instance.Spec.TTS.ObjectStore.Storage.StorageClassName
			pvc.Spec.StorageClassName = &sc
		}
		return nil
	})
}

// reconcileObjectStoreService ensures the object store Service exists.
func (r *GammaInstanceReconciler) reconcileObjectStoreService(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	name := ttsObjectStoreName(instance)
	apiPort := instance.Spec.TTS.ObjectStore.Ports.APIPort()
	consolePort := instance.Spec.TTS.ObjectStore.Ports.ConsolePort()

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, svc, func() error {
		svc.Labels = labelsForComponent(instance, "tts-object-store")
		svc.Spec = corev1.ServiceSpec{
			Type: corev1.ServiceTypeClusterIP,
			Ports: []corev1.ServicePort{
				{
					Name:       "api",
					Port:       apiPort,
					TargetPort: intstr.FromInt32(apiPort),
					Protocol:   corev1.ProtocolTCP,
				},
				{
					Name:       "console",
					Port:       consolePort,
					TargetPort: intstr.FromInt32(consolePort),
					Protocol:   corev1.ProtocolTCP,
				},
			},
			Selector: selectorLabelsForComponent(instance, "tts-object-store"),
		}
		return nil
	})
}

// reconcileObjectStoreDeployment ensures the SeaweedFS deployment exists.
func (r *GammaInstanceReconciler) reconcileObjectStoreDeployment(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	name := ttsObjectStoreName(instance)
	labels := labelsForComponent(instance, "tts-object-store")
	selectorLabels := selectorLabelsForComponent(instance, "tts-object-store")
	replicas := int32(1)
	apiPort := instance.Spec.TTS.ObjectStore.Ports.APIPort()
	consolePort := instance.Spec.TTS.ObjectStore.Ports.ConsolePort()

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
							Name:    "seaweedfs",
							Image:   instance.Spec.TTS.ObjectStore.ObjectStoreImage(),
							Command: []string{"weed"},
							Args: []string{
								"server",
								"-dir=/data",
								"-s3",
								fmt.Sprintf("-s3.port=%d", apiPort),
								fmt.Sprintf("-master.port=%d", consolePort+1),
								fmt.Sprintf("-filer.port=%d", consolePort),
							},
							Env: []corev1.EnvVar{
								instance.Spec.TTS.ObjectStore.Credentials.AccessKeyEnvVar(),
								instance.Spec.TTS.ObjectStore.Credentials.SecretKeyEnvVar(),
							},
							Ports: []corev1.ContainerPort{
								{Name: "api", ContainerPort: apiPort, Protocol: corev1.ProtocolTCP},
								{Name: "console", ContainerPort: consolePort, Protocol: corev1.ProtocolTCP},
							},
							Resources: instance.Spec.TTS.ObjectStore.Resources,
							VolumeMounts: []corev1.VolumeMount{
								{Name: "data", MountPath: "/data"},
							},
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/",
										Port: intstr.FromInt32(apiPort),
									},
								},
								InitialDelaySeconds: 10,
								PeriodSeconds:       10,
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/",
										Port: intstr.FromInt32(apiPort),
									},
								},
								InitialDelaySeconds: 30,
								PeriodSeconds:       20,
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: "data",
							VolumeSource: corev1.VolumeSource{
								PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
									ClaimName: ttsObjectStorePVCName(instance),
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
