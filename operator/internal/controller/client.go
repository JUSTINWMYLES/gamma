package controller

import (
	"context"
	"fmt"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"

	gammav1alpha1 "github.com/gamma/gamma-operator/api/v1alpha1"
)

// reconcileClientDeployment ensures the client Deployment exists and matches the desired state.
func (r *GammaInstanceReconciler) reconcileClientDeployment(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	clientName := fmt.Sprintf("%s-client", instance.Name)
	labels := labelsForComponent(instance, "client")
	selectorLabels := selectorLabelsForComponent(instance, "client")
	replicas := instance.Spec.Client.ClientReplicas()

	deploy := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      clientName,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, deploy, func() error {
		deploy.Labels = labels

		serverURL := fmt.Sprintf("ws://%s-server.%s.svc.cluster.local:%d",
			instance.Name, instance.Namespace, instance.Spec.Server.ServerPort())

		deploy.Spec = appsv1.DeploymentSpec{
			Replicas: &replicas,
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
							Name:  "client",
							Image: instance.Spec.Client.Image,
							Ports: []corev1.ContainerPort{
								{
									Name:          "http",
									ContainerPort: 80,
									Protocol:      corev1.ProtocolTCP,
								},
							},
							Env: []corev1.EnvVar{
								{
									Name:  "VITE_SERVER_URL",
									Value: serverURL,
								},
							},
							Resources: instance.Spec.Client.Resources,
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/",
										Port: intstr.FromInt32(80),
									},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       10,
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/",
										Port: intstr.FromInt32(80),
									},
								},
								InitialDelaySeconds: 10,
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

// reconcileClientService ensures the client Service exists.
func (r *GammaInstanceReconciler) reconcileClientService(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	clientName := fmt.Sprintf("%s-client", instance.Name)

	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      clientName,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, svc, func() error {
		svc.Labels = labelsForComponent(instance, "client")
		svc.Spec = corev1.ServiceSpec{
			Type: corev1.ServiceTypeClusterIP,
			Ports: []corev1.ServicePort{
				{
					Name:       "http",
					Port:       80,
					TargetPort: intstr.FromInt32(80),
					Protocol:   corev1.ProtocolTCP,
				},
			},
			Selector: selectorLabelsForComponent(instance, "client"),
		}
		return nil
	})
}
