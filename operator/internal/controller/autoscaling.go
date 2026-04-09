package controller

import (
	"context"
	"fmt"

	autoscalingv2 "k8s.io/api/autoscaling/v2"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	gammav1alpha1 "github.com/JUSTINWMYLES/gamma/operator/api/v1alpha1"
)

// reconcileHPA ensures the HorizontalPodAutoscaler exists for the server Deployment.
func (r *GammaInstanceReconciler) reconcileHPA(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	hpaName := fmt.Sprintf("%s-server", instance.Name)
	serverName := fmt.Sprintf("%s-server", instance.Name)

	hpa := &autoscalingv2.HorizontalPodAutoscaler{
		ObjectMeta: metav1.ObjectMeta{
			Name:      hpaName,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, hpa, func() error {
		hpa.Labels = labelsForComponent(instance, "server")

		as := instance.Spec.Autoscaling
		minReplicas := as.MinReplicas
		if minReplicas < 1 {
			minReplicas = 1
		}
		maxReplicas := as.MaxReplicas
		if maxReplicas < 1 {
			maxReplicas = 10
		}
		cpuTarget := as.TargetCPUUtilizationPercentage
		if cpuTarget <= 0 {
			cpuTarget = 70
		}

		scaleDownStabilization := int32(300)
		scaleUpStabilization := int32(30)
		scaleDownPods := int32(1)
		scaleDownPeriod := int32(60)
		scaleUpPods := int32(2)
		scaleUpPeriod := int32(60)

		hpa.Spec = autoscalingv2.HorizontalPodAutoscalerSpec{
			ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
				APIVersion: "apps/v1",
				Kind:       "Deployment",
				Name:       serverName,
			},
			MinReplicas: &minReplicas,
			MaxReplicas: maxReplicas,
			Metrics: []autoscalingv2.MetricSpec{
				{
					Type: autoscalingv2.ResourceMetricSourceType,
					Resource: &autoscalingv2.ResourceMetricSource{
						Name: "cpu",
						Target: autoscalingv2.MetricTarget{
							Type:               autoscalingv2.UtilizationMetricType,
							AverageUtilization: &cpuTarget,
						},
					},
				},
			},
			Behavior: &autoscalingv2.HorizontalPodAutoscalerBehavior{
				ScaleDown: &autoscalingv2.HPAScalingRules{
					StabilizationWindowSeconds: &scaleDownStabilization,
					Policies: []autoscalingv2.HPAScalingPolicy{
						{
							Type:          autoscalingv2.PodsScalingPolicy,
							Value:         scaleDownPods,
							PeriodSeconds: scaleDownPeriod,
						},
					},
				},
				ScaleUp: &autoscalingv2.HPAScalingRules{
					StabilizationWindowSeconds: &scaleUpStabilization,
					Policies: []autoscalingv2.HPAScalingPolicy{
						{
							Type:          autoscalingv2.PodsScalingPolicy,
							Value:         scaleUpPods,
							PeriodSeconds: scaleUpPeriod,
						},
					},
				},
			},
		}
		return nil
	})
}

// cleanupHPA removes the HPA if it exists and autoscaling is disabled.
func (r *GammaInstanceReconciler) cleanupHPA(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	hpa := &autoscalingv2.HorizontalPodAutoscaler{}
	hpaName := fmt.Sprintf("%s-server", instance.Name)
	err := r.Get(ctx, types.NamespacedName{Name: hpaName, Namespace: instance.Namespace}, hpa)
	if errors.IsNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}
	return r.Delete(ctx, hpa)
}
