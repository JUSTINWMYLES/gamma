package v1alpha1

import (
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// GammaInstanceSpec defines the desired state of a Gamma deployment.
type GammaInstanceSpec struct {
	// Server configuration for the Colyseus game server.
	Server ServerSpec `json:"server"`
	// Client configuration for the nginx SPA frontend.
	Client ClientSpec `json:"client"`
	// Redis configuration for game state persistence.
	// +optional
	Redis RedisSpec `json:"redis,omitempty"`
	// Networking configuration (ingress).
	// +optional
	Networking NetworkingSpec `json:"networking,omitempty"`
	// Autoscaling configuration for the server deployment.
	// +optional
	Autoscaling *AutoscalingSpec `json:"autoscaling,omitempty"`
}

// ServerSpec defines the desired state for the Gamma server component.
type ServerSpec struct {
	// Container image for the Gamma Colyseus server.
	Image string `json:"image"`
	// Number of server pod replicas.
	// +kubebuilder:default=1
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:Maximum=100
	// +optional
	Replicas *int32 `json:"replicas,omitempty"`
	// Port the Colyseus server listens on.
	// +kubebuilder:default=2567
	// +kubebuilder:validation:Minimum=1024
	// +kubebuilder:validation:Maximum=65535
	// +optional
	Port int32 `json:"port,omitempty"`
	// Resource requirements for server pods.
	// +optional
	Resources corev1.ResourceRequirements `json:"resources,omitempty"`
	// Additional environment variables injected into server pods.
	// +optional
	Env []corev1.EnvVar `json:"env,omitempty"`
}

// ClientSpec defines the desired state for the Gamma client component.
type ClientSpec struct {
	// Container image for the Gamma client (nginx SPA).
	Image string `json:"image"`
	// Number of client pod replicas.
	// +kubebuilder:default=1
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:Maximum=100
	// +optional
	Replicas *int32 `json:"replicas,omitempty"`
	// Resource requirements for client pods.
	// +optional
	Resources corev1.ResourceRequirements `json:"resources,omitempty"`
}

// RedisSpec defines the desired state for the Redis component.
type RedisSpec struct {
	// Whether to deploy a Redis StatefulSet for game state.
	// +kubebuilder:default=true
	// +optional
	Enabled *bool `json:"enabled,omitempty"`
	// Container image for Redis.
	// +kubebuilder:default="redis:7-alpine"
	// +optional
	Image string `json:"image,omitempty"`
	// Resource requirements for Redis pods.
	// +optional
	Resources corev1.ResourceRequirements `json:"resources,omitempty"`
	// Persistent storage configuration.
	// +optional
	Storage RedisStorageSpec `json:"storage,omitempty"`
}

// RedisStorageSpec defines Redis persistent storage settings.
type RedisStorageSpec struct {
	// PVC size for Redis data.
	// +kubebuilder:default="1Gi"
	// +optional
	Size string `json:"size,omitempty"`
	// StorageClass name. Empty uses cluster default.
	// +optional
	StorageClassName string `json:"storageClassName,omitempty"`
}

// NetworkingSpec defines networking settings.
type NetworkingSpec struct {
	// Ingress configuration.
	// +optional
	Ingress IngressSpec `json:"ingress,omitempty"`
}

// IngressSpec defines the desired state for the Ingress resource.
type IngressSpec struct {
	// Whether to create an Ingress resource.
	// +optional
	Enabled bool `json:"enabled,omitempty"`
	// Ingress class name.
	// +optional
	ClassName string `json:"className,omitempty"`
	// Hostname for the Ingress resource.
	// +optional
	Host string `json:"host,omitempty"`
	// TLS configuration.
	// +optional
	TLS IngressTLSSpec `json:"tls,omitempty"`
	// Extra ingress annotations.
	// +optional
	Annotations map[string]string `json:"annotations,omitempty"`
}

// IngressTLSSpec defines TLS settings for the Ingress.
type IngressTLSSpec struct {
	// Whether to enable TLS.
	// +optional
	Enabled bool `json:"enabled,omitempty"`
	// Secret name containing TLS certificate.
	// +optional
	SecretName string `json:"secretName,omitempty"`
}

// AutoscalingSpec defines autoscaling settings for server pods.
type AutoscalingSpec struct {
	// Whether to create an HPA for the server deployment.
	Enabled bool `json:"enabled"`
	// Minimum number of replicas.
	// +kubebuilder:default=1
	// +kubebuilder:validation:Minimum=1
	// +optional
	MinReplicas int32 `json:"minReplicas,omitempty"`
	// Maximum number of replicas.
	// +kubebuilder:default=10
	// +optional
	MaxReplicas int32 `json:"maxReplicas,omitempty"`
	// Target CPU utilization percentage.
	// +kubebuilder:default=70
	// +optional
	TargetCPUUtilizationPercentage int32 `json:"targetCPUUtilizationPercentage,omitempty"`
}

// GammaInstanceStatus defines the observed state of a Gamma deployment.
type GammaInstanceStatus struct {
	// Current phase of the deployment.
	// +optional
	Phase string `json:"phase,omitempty"`
	// Number of ready server replicas.
	// +optional
	ServerReadyReplicas int32 `json:"serverReadyReplicas,omitempty"`
	// Number of ready client replicas.
	// +optional
	ClientReadyReplicas int32 `json:"clientReadyReplicas,omitempty"`
	// Whether Redis is ready.
	// +optional
	RedisReady bool `json:"redisReady,omitempty"`
	// Server service endpoint.
	// +optional
	ServerEndpoint string `json:"serverEndpoint,omitempty"`
	// Client service endpoint.
	// +optional
	ClientEndpoint string `json:"clientEndpoint,omitempty"`
	// Redis service endpoint.
	// +optional
	RedisEndpoint string `json:"redisEndpoint,omitempty"`
	// Status conditions for each component.
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
	// Last observed generation of the spec.
	// +optional
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Server",type=integer,JSONPath=`.status.serverReadyReplicas`
// +kubebuilder:printcolumn:name="Client",type=integer,JSONPath=`.status.clientReadyReplicas`
// +kubebuilder:printcolumn:name="Redis",type=boolean,JSONPath=`.status.redisReady`
// +kubebuilder:printcolumn:name="Age",type=date,JSONPath=`.metadata.creationTimestamp`

// GammaInstance is the Schema for the gammainstances API.
type GammaInstance struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`
	Spec              GammaInstanceSpec   `json:"spec,omitempty"`
	Status            GammaInstanceStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// GammaInstanceList contains a list of GammaInstance.
type GammaInstanceList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []GammaInstance `json:"items"`
}

func init() {
	SchemeBuilder.Register(&GammaInstance{}, &GammaInstanceList{})
}

// Helper methods for safe access to optional fields.

// ServerReplicas returns the desired server replica count, defaulting to 1.
func (s *ServerSpec) ServerReplicas() int32 {
	if s.Replicas != nil {
		return *s.Replicas
	}
	return 1
}

// ServerPort returns the server port, defaulting to 2567.
func (s *ServerSpec) ServerPort() int32 {
	if s.Port != 0 {
		return s.Port
	}
	return 2567
}

// ClientReplicas returns the desired client replica count, defaulting to 1.
func (c *ClientSpec) ClientReplicas() int32 {
	if c.Replicas != nil {
		return *c.Replicas
	}
	return 1
}

// IsRedisEnabled returns whether Redis is enabled, defaulting to true.
func (r *RedisSpec) IsRedisEnabled() bool {
	if r.Enabled != nil {
		return *r.Enabled
	}
	return true
}

// RedisImage returns the Redis container image, defaulting to redis:7-alpine.
func (r *RedisSpec) RedisImage() string {
	if r.Image != "" {
		return r.Image
	}
	return "redis:7-alpine"
}

// RedisStorageSize returns the PVC size, defaulting to 1Gi.
func (s *RedisStorageSpec) RedisStorageSize() string {
	if s.Size != "" {
		return s.Size
	}
	return "1Gi"
}
