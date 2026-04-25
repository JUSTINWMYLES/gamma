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

// reconcileMinIOPVC ensures the MinIO PVC exists.
func (r *GammaInstanceReconciler) reconcileMinIOPVC(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	pvc := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ttsMinIOPVCName(instance),
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, pvc, func() error {
		pvc.Labels = labelsForComponent(instance, "tts-minio")
		pvc.Spec = corev1.PersistentVolumeClaimSpec{
			AccessModes: []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse(instance.Spec.TTS.MinIO.Storage.StorageSize()),
				},
			},
		}
		if instance.Spec.TTS.MinIO.Storage.StorageClassName != "" {
			sc := instance.Spec.TTS.MinIO.Storage.StorageClassName
			pvc.Spec.StorageClassName = &sc
		}
		return nil
	})
}

// reconcileMinIOService ensures the MinIO Service exists.
func (r *GammaInstanceReconciler) reconcileMinIOService(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	name := ttsMinIOName(instance)
	apiPort := instance.Spec.TTS.MinIO.Ports.APIPort()
	consolePort := instance.Spec.TTS.MinIO.Ports.ConsolePort()

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, svc, func() error {
		svc.Labels = labelsForComponent(instance, "tts-minio")
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
			Selector: selectorLabelsForComponent(instance, "tts-minio"),
		}
		return nil
	})
}

// reconcileMinIODeployment ensures the MinIO deployment exists.
func (r *GammaInstanceReconciler) reconcileMinIODeployment(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	name := ttsMinIOName(instance)
	labels := labelsForComponent(instance, "tts-minio")
	selectorLabels := selectorLabelsForComponent(instance, "tts-minio")
	replicas := int32(1)
	apiPort := instance.Spec.TTS.MinIO.Ports.APIPort()
	consolePort := instance.Spec.TTS.MinIO.Ports.ConsolePort()

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
							Name:  "minio",
							Image: instance.Spec.TTS.MinIO.MinIOImage(),
							Args: []string{
								"server",
								"/data",
								"--console-address",
								fmt.Sprintf(":%d", consolePort),
							},
							Env: []corev1.EnvVar{
								instance.Spec.TTS.MinIO.Credentials.AccessKeyEnvVar(),
								instance.Spec.TTS.MinIO.Credentials.SecretKeyEnvVar(),
							},
							Ports: []corev1.ContainerPort{
								{Name: "api", ContainerPort: apiPort, Protocol: corev1.ProtocolTCP},
								{Name: "console", ContainerPort: consolePort, Protocol: corev1.ProtocolTCP},
							},
							Resources: instance.Spec.TTS.MinIO.Resources,
							VolumeMounts: []corev1.VolumeMount{
								{Name: "data", MountPath: "/data"},
							},
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/minio/health/ready",
										Port: intstr.FromInt32(apiPort),
									},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       10,
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/minio/health/live",
										Port: intstr.FromInt32(apiPort),
									},
								},
								InitialDelaySeconds: 15,
								PeriodSeconds:       20,
							},
						},
					},
					Volumes: []corev1.Volume{
						{
							Name: "data",
							VolumeSource: corev1.VolumeSource{
								PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{
									ClaimName: ttsMinIOPVCName(instance),
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
