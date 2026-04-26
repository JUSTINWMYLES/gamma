package controller

import (
	"context"
	"fmt"

	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"

	gammav1alpha1 "github.com/JUSTINWMYLES/gamma/operator/api/v1alpha1"
)

// reconcileIngress ensures the Ingress resource exists with WebSocket-aware annotations.
func (r *GammaInstanceReconciler) reconcileIngress(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	ingressName := instance.Name
	serverName := fmt.Sprintf("%s-server", instance.Name)
	clientName := fmt.Sprintf("%s-client", instance.Name)
	serverPort := instance.Spec.Server.ServerPort()

	ingress := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{
			Name:      ingressName,
			Namespace: instance.Namespace,
		},
	}

	return r.createOrUpdate(ctx, instance, ingress, func() error {
		ingress.Labels = labelsForComponent(instance, "ingress")

		// Build annotations — start with WebSocket defaults for nginx.
		// Cookie affinity is used for sticky sessions. Do NOT add
		// upstream-hash-by here — consistent hashing redistributes clients
		// when pods scale, breaking Colyseus seat reservations which are
		// stored in local memory per-pod.
		annotations := map[string]string{
			"nginx.ingress.kubernetes.io/proxy-read-timeout":     "3600",
			"nginx.ingress.kubernetes.io/proxy-send-timeout":     "3600",
			"nginx.ingress.kubernetes.io/affinity":               "cookie",
			"nginx.ingress.kubernetes.io/affinity-mode":          "persistent",
			"nginx.ingress.kubernetes.io/session-cookie-name":    "gamma-sticky",
			"nginx.ingress.kubernetes.io/session-cookie-max-age": "3600",
			"nginx.ingress.kubernetes.io/proxy-http-version":     "1.1",
		}

		// Merge user-supplied annotations (user annotations take precedence).
		for k, v := range instance.Spec.Networking.Ingress.Annotations {
			annotations[k] = v
		}
		ingress.Annotations = annotations

		// Set ingress class.
		className := instance.Spec.Networking.Ingress.ClassName
		if className == "" {
			className = "nginx"
		}
		ingress.Spec.IngressClassName = &className

		pathTypePrefix := networkingv1.PathTypePrefix
		wsPort := int32(serverPort)
		clientPort := int32(80)

		rules := []networkingv1.IngressRule{
			{
				Host: instance.Spec.Networking.Ingress.Host,
				IngressRuleValue: networkingv1.IngressRuleValue{
					HTTP: &networkingv1.HTTPIngressRuleValue{
						Paths: []networkingv1.HTTPIngressPath{
							// Browsers fetch News Broadcast audio from the Gamma server,
							// which proxies private TTS artifact requests upstream.
							// Keep /api/tts routed to the server service instead of
							// exposing the TTS API directly at the ingress edge.
							{
								Path:     "/api/tts",
								PathType: &pathTypePrefix,
								Backend: networkingv1.IngressBackend{
									Service: &networkingv1.IngressServiceBackend{
										Name: serverName,
										Port: networkingv1.ServiceBackendPort{
											Number: wsPort,
										},
									},
								},
							},
							{
								Path:     "/ws",
								PathType: &pathTypePrefix,
								Backend: networkingv1.IngressBackend{
									Service: &networkingv1.IngressServiceBackend{
										Name: serverName,
										Port: networkingv1.ServiceBackendPort{
											Number: wsPort,
										},
									},
								},
							},
							{
								Path:     "/",
								PathType: &pathTypePrefix,
								Backend: networkingv1.IngressBackend{
									Service: &networkingv1.IngressServiceBackend{
										Name: clientName,
										Port: networkingv1.ServiceBackendPort{
											Number: clientPort,
										},
									},
								},
							},
						},
					},
				},
			},
		}
		ingress.Spec.Rules = rules

		// Configure TLS if enabled.
		if instance.Spec.Networking.Ingress.TLS.Enabled {
			ingress.Spec.TLS = []networkingv1.IngressTLS{
				{
					Hosts:      []string{instance.Spec.Networking.Ingress.Host},
					SecretName: instance.Spec.Networking.Ingress.TLS.SecretName,
				},
			}
		} else {
			ingress.Spec.TLS = nil
		}

		return nil
	})
}

// cleanupIngress removes the Ingress if it exists and ingress is disabled.
func (r *GammaInstanceReconciler) cleanupIngress(ctx context.Context, instance *gammav1alpha1.GammaInstance) error {
	ingress := &networkingv1.Ingress{}
	err := r.Get(ctx, types.NamespacedName{Name: instance.Name, Namespace: instance.Namespace}, ingress)
	if errors.IsNotFound(err) {
		return nil
	}
	if err != nil {
		return err
	}
	return r.Delete(ctx, ingress)
}
