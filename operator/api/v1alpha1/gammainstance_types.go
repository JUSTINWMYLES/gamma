package v1alpha1

import (
	"strings"

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
	// TTS provisions News Broadcast speech synthesis infrastructure.
	// +optional
	TTS TTSSpec `json:"tts,omitempty"`
	// AudioOverlay configures infrastructure for the Audio Overlay game.
	// +optional
	AudioOverlay AudioOverlaySpec `json:"audioOverlay,omitempty"`
	// Networking configuration (ingress).
	// +optional
	Networking NetworkingSpec `json:"networking,omitempty"`
	// Autoscaling configuration for the server deployment.
	// +optional
	Autoscaling *AutoscalingSpec `json:"autoscaling,omitempty"`
	// Observability configures OpenTelemetry tracing and metrics export.
	// +optional
	Observability ObservabilitySpec `json:"observability,omitempty"`
	// Region is an informational label for future multi-region federation.
	// +optional
	Region string `json:"region,omitempty"`
}

// ServerSpec defines the desired state for the Gamma server component.
type ServerSpec struct {
	// Container image for the Gamma Colyseus server.
	Image string `json:"image"`
	// Number of server pod replicas.
	// IMPORTANT: Colyseus rooms live in local memory. With >1 replica,
	// WebSocket connections may land on a pod that does not host the room,
	// causing "seat reservation expired" errors. Use 1 replica unless you
	// deploy a @colyseus/proxy layer for room-aware routing.
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
	// SecretEnvVars loads environment variables from Kubernetes Secrets.
	// Use this for sensitive values such as third-party API keys (e.g. a GIF
	// service API key) that must not be stored in plain text in the CR spec.
	// +optional
	SecretEnvVars []SecretEnvVar `json:"secretEnvVars,omitempty"`
	// Annotations applied to the server Deployment.
	// Special annotations:
	//   "gamma.io/colyseus-proxy" — when present, indicates a @colyseus/proxy
	//   layer is deployed, enabling multi-replica room-aware routing.
	// +optional
	Annotations map[string]string `json:"annotations,omitempty"`
}

// SecretEnvVar describes a single environment variable whose value is sourced
// from a key in a Kubernetes Secret.
type SecretEnvVar struct {
	// Name of the environment variable to expose in the server container.
	Name string `json:"name"`
	// SecretName is the name of the Kubernetes Secret in the same namespace.
	SecretName string `json:"secretName"`
	// SecretKey is the key within the Secret whose value will be used.
	SecretKey string `json:"secretKey"`
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
	// ServerURL overrides the public Colyseus base URL consumed by browsers.
	// This value is injected into the client container at runtime and should
	// point at a browser-reachable endpoint such as wss://gamma.example.com/ws.
	// When omitted, the client derives the URL from window.location.
	// +optional
	ServerURL string `json:"serverUrl,omitempty"`
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
	// MaxMemory sets the Redis maxmemory limit (e.g. "256mb", "1gb").
	// When empty, defaults to "200mb".
	// +optional
	MaxMemory string `json:"maxMemory,omitempty"`
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

// TTSSpec defines the desired state for the News Broadcast TTS stack.
type TTSSpec struct {
	// Whether to deploy TTS infrastructure and wire the Gamma server to it.
	// +kubebuilder:default=false
	// +optional
	Enabled bool `json:"enabled,omitempty"`
	// API configures the HTTP service that accepts jobs and exposes artifacts.
	// +optional
	API TTSAPISpec `json:"api,omitempty"`
	// Worker configures the synthesis worker deployment.
	// +optional
	Worker TTSWorkerSpec `json:"worker,omitempty"`
	// ObjectStore configures the self-contained S3-compatible object store (SeaweedFS) used for TTS artifacts.
	// +optional
	ObjectStore TTSObjectStoreSpec `json:"objectStore,omitempty"`
	// Config contains shared runtime settings applied to the TTS API and worker.
	// +optional
	Config TTSConfigSpec `json:"config,omitempty"`
}

// TTSAPISpec defines the desired state for the TTS API component.
type TTSAPISpec struct {
	// Container image for the Go TTS API.
	// +kubebuilder:default="ghcr.io/gamma/gamma-tts-api:latest"
	// +optional
	Image string `json:"image,omitempty"`
	// Number of TTS API pod replicas.
	// +kubebuilder:default=1
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:Maximum=100
	// +optional
	Replicas *int32 `json:"replicas,omitempty"`
	// Port the TTS API listens on.
	// +kubebuilder:default=8090
	// +kubebuilder:validation:Minimum=1024
	// +kubebuilder:validation:Maximum=65535
	// +optional
	Port int32 `json:"port,omitempty"`
	// Resource requirements for TTS API pods.
	// +optional
	Resources corev1.ResourceRequirements `json:"resources,omitempty"`
}

// TTSWorkerSpec defines the desired state for the TTS worker component.
type TTSWorkerSpec struct {
	// Container image for the TTS worker.
	// +kubebuilder:default="ghcr.io/gamma/gamma-tts-worker:latest"
	// +optional
	Image string `json:"image,omitempty"`
	// Number of worker pod replicas.
	// The worker runtime still processes one job at a time per worker pod.
	// +kubebuilder:default=1
	// +kubebuilder:validation:Minimum=1
	// +kubebuilder:validation:Maximum=100
	// +optional
	Replicas *int32 `json:"replicas,omitempty"`
	// Resource requirements for worker pods.
	// +optional
	Resources corev1.ResourceRequirements `json:"resources,omitempty"`
	// Port the worker health HTTP server listens on.
	// +kubebuilder:default=8091
	// +kubebuilder:validation:Minimum=1024
	// +kubebuilder:validation:Maximum=65535
	// +optional
	HealthPort int32 `json:"healthPort,omitempty"`
}

// TTSObjectStoreSpec defines the desired state for the S3-compatible object store (SeaweedFS).
type TTSObjectStoreSpec struct {
	// Container image for the object store.
	// +kubebuilder:default="chrislusf/seaweedfs:4.21"
	// +optional
	Image string `json:"image,omitempty"`
	// Resource requirements for the object store pod.
	// +optional
	Resources corev1.ResourceRequirements `json:"resources,omitempty"`
	// Persistent storage configuration for TTS artifacts.
	// +optional
	Storage TTSObjectStoreStorageSpec `json:"storage,omitempty"`
	// Service ports exposed by the object store.
	// +optional
	Ports TTSObjectStorePortsSpec `json:"ports,omitempty"`
	// Bootstrap credentials used by the object store and by the TTS API/worker.
	// +optional
	Credentials TTSObjectStoreCredentialsSpec `json:"credentials,omitempty"`
}

// TTSObjectStoreStorageSpec defines object store persistent storage settings.
type TTSObjectStoreStorageSpec struct {
	// PVC size for object store data.
	// +kubebuilder:default="5Gi"
	// +optional
	Size string `json:"size,omitempty"`
	// StorageClass name. Empty uses cluster default.
	// +optional
	StorageClassName string `json:"storageClassName,omitempty"`
}

// TTSObjectStorePortsSpec defines the service ports exposed by the object store.
type TTSObjectStorePortsSpec struct {
	// API is the S3-compatible API port.
	// +kubebuilder:default=8333
	// +kubebuilder:validation:Minimum=1024
	// +kubebuilder:validation:Maximum=65535
	// +optional
	API int32 `json:"api,omitempty"`
	// Console is the web console port.
	// +kubebuilder:default=9333
	// +kubebuilder:validation:Minimum=1024
	// +kubebuilder:validation:Maximum=65535
	// +optional
	Console int32 `json:"console,omitempty"`
}

// TTSObjectStoreCredentialsSpec defines the object store bootstrap credentials.
type TTSObjectStoreCredentialsSpec struct {
	// SecretRef references a Kubernetes Secret that holds object store credentials.
	// The secret must contain keys named "accessKey" and "secretKey".
	// +optional
	SecretRef *corev1.LocalObjectReference `json:"secretRef,omitempty"`
}

// TTSConfigSpec defines shared TTS runtime configuration.
type TTSConfigSpec struct {
	// BucketName is the MinIO bucket used to store synthesized artifacts.
	// +kubebuilder:default="gamma-tts-artifacts"
	// +optional
	BucketName string `json:"bucketName,omitempty"`
	// ModelVersion is recorded on jobs and shared between the API and worker.
	// +kubebuilder:default="OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX"
	// +optional
	ModelVersion string `json:"modelVersion,omitempty"`
	// RedisKeyPrefix namespaces TTS queue state inside Redis.
	// +kubebuilder:default="gamma:tts"
	// +optional
	RedisKeyPrefix string `json:"redisKeyPrefix,omitempty"`
	// RequireWorkerReady keeps the API unready until a healthy worker heartbeat exists.
	// +kubebuilder:default=true
	// +optional
	RequireWorkerReady *bool `json:"requireWorkerReady,omitempty"`
	// RequireCustomVoicePack keeps the API unready until packaged custom voice packs exist.
	// +kubebuilder:default=false
	// +optional
	RequireCustomVoicePack *bool `json:"requireCustomVoicePack,omitempty"`
}

// AudioOverlaySpec defines infrastructure options for the Audio Overlay game.
type AudioOverlaySpec struct {
	// ObjectStore enables storage of recorded Audio Overlay clips in the shared
	// SeaweedFS/S3-compatible object store. Browsers still fetch clips through the
	// Gamma server proxy, never directly from the object store.
	// +optional
	ObjectStore AudioOverlayObjectStoreSpec `json:"objectStore,omitempty"`
}

// AudioOverlayObjectStoreSpec defines how Audio Overlay uses the shared object store.
type AudioOverlayObjectStoreSpec struct {
	// Enabled stores Audio Overlay clips in the shared S3-compatible object store
	// instead of sending base64 payloads during playback whenever the store is
	// available. When false, Audio Overlay keeps the inline/base64 behavior.
	// +kubebuilder:default=false
	// +optional
	Enabled bool `json:"enabled,omitempty"`
	// BucketName is the bucket used for recorded Audio Overlay clips.
	// +kubebuilder:default="gamma-audio-overlay-clips"
	// +optional
	BucketName string `json:"bucketName,omitempty"`
	// Prefix namespaces Audio Overlay clip objects within the bucket.
	// +kubebuilder:default="audio-overlay-clips"
	// +optional
	Prefix string `json:"prefix,omitempty"`
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

// ObservabilitySpec configures OpenTelemetry tracing and metrics export for the
// server component. The server reads OTEL_ENABLED, OTEL_EXPORTER_OTLP_ENDPOINT,
// and OTEL_SERVICE_NAME at startup; this spec translates those values into
// container environment variables automatically.
type ObservabilitySpec struct {
	// Whether to enable OpenTelemetry telemetry.
	// When false the operator injects OTEL_ENABLED=false, disabling all traces
	// and metrics regardless of the image's built-in defaults.
	// When true the operator injects OTEL_ENABLED=true and, if otlpEndpoint is
	// set, OTEL_EXPORTER_OTLP_ENDPOINT pointing at your OTEL Collector.
	// When the field is omitted entirely, no OTEL_* vars are injected and the
	// server falls back to its own built-in defaults.
	// +optional
	Enabled *bool `json:"enabled,omitempty"`
	// OTLPEndpoint is the base URL of an OpenTelemetry Collector that accepts
	// OTLP/HTTP (e.g. http://otel-collector.monitoring.svc:4318).
	// Traces are sent to <otlpEndpoint>/v1/traces and metrics to
	// <otlpEndpoint>/v1/metrics every 10 seconds.
	// Required when enabled is true and you want telemetry to reach a collector;
	// omit to keep the server's default (http://localhost:4318).
	// +optional
	OTLPEndpoint string `json:"otlpEndpoint,omitempty"`
	// ServiceName overrides the OTEL service name reported in traces and metrics.
	// Defaults to "gamma-server" when not set.
	// +optional
	ServiceName string `json:"serviceName,omitempty"`
}

// GammaInstanceStatus defines the observed state of a Gamma deployment.
type GammaInstanceStatus struct {
	// Current phase of the deployment.
	// +kubebuilder:validation:Enum=Pending;Deploying;Running;Degraded;Failed
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
	// Whether the TTS stack is fully ready.
	// +optional
	TTSReady bool `json:"ttsReady,omitempty"`
	// Number of ready TTS API replicas.
	// +optional
	TTSAPIReadyReplicas int32 `json:"ttsApiReadyReplicas,omitempty"`
	// Number of ready TTS worker replicas.
	// +optional
	TTSWorkerReadyReplicas int32 `json:"ttsWorkerReadyReplicas,omitempty"`
	// Whether the TTS object store is ready.
	// +optional
	TTSObjectStoreReady bool `json:"ttsObjectStoreReady,omitempty"`
	// Server service endpoint.
	// +optional
	ServerEndpoint string `json:"serverEndpoint,omitempty"`
	// Client service endpoint.
	// +optional
	ClientEndpoint string `json:"clientEndpoint,omitempty"`
	// Redis service endpoint.
	// +optional
	RedisEndpoint string `json:"redisEndpoint,omitempty"`
	// TTS API service endpoint.
	// +optional
	TTSAPIEndpoint string `json:"ttsApiEndpoint,omitempty"`
	// TTS object store API endpoint.
	// +optional
	TTSObjectStoreEndpoint string `json:"ttsObjectStoreEndpoint,omitempty"`
	// TTS object store console endpoint.
	// +optional
	TTSObjectStoreConsoleEndpoint string `json:"ttsObjectStoreConsoleEndpoint,omitempty"`
	// Status conditions for each component.
	// +optional
	Conditions []metav1.Condition `json:"conditions,omitempty"`
	// Last observed generation of the spec.
	// +optional
	ObservedGeneration int64 `json:"observedGeneration,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:resource:shortName=gi
// +kubebuilder:subresource:status
// +kubebuilder:printcolumn:name="Phase",type=string,JSONPath=`.status.phase`
// +kubebuilder:printcolumn:name="Server",type=integer,JSONPath=`.status.serverReadyReplicas`
// +kubebuilder:printcolumn:name="Client",type=integer,JSONPath=`.status.clientReadyReplicas`
// +kubebuilder:printcolumn:name="Redis",type=boolean,JSONPath=`.status.redisReady`
// +kubebuilder:printcolumn:name="TTS",type=boolean,JSONPath=`.status.ttsReady`
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

// MaxMemoryValue returns the Redis maxmemory setting, defaulting to 200mb.
func (r *RedisSpec) MaxMemoryValue() string {
	if r.MaxMemory != "" {
		return r.MaxMemory
	}
	return "200mb"
}

// IsTTSEnabled returns whether the News Broadcast TTS stack is enabled.
func (t *TTSSpec) IsTTSEnabled() bool {
	return t.Enabled
}

// UsesObjectStore returns whether Audio Overlay clip storage is enabled.
func (s *AudioOverlaySpec) UsesObjectStore() bool {
	return s.ObjectStore.Enabled
}

// APIImage returns the TTS API container image.
func (s *TTSAPISpec) APIImage() string {
	if s.Image != "" {
		return s.Image
	}
	return "ghcr.io/gamma/gamma-tts-api:latest"
}

// APIReplicas returns the desired TTS API replica count.
func (s *TTSAPISpec) APIReplicas() int32 {
	if s.Replicas != nil {
		return *s.Replicas
	}
	return 1
}

// APIPort returns the TTS API service port.
func (s *TTSAPISpec) APIPort() int32 {
	if s.Port != 0 {
		return s.Port
	}
	return 8090
}

// WorkerImage returns the TTS worker container image.
func (s *TTSWorkerSpec) WorkerImage() string {
	if s.Image != "" {
		return s.Image
	}
	return "ghcr.io/gamma/gamma-tts-worker:latest"
}

// WorkerReplicas returns the desired worker replica count.
func (s *TTSWorkerSpec) WorkerReplicas() int32 {
	if s.Replicas != nil {
		return *s.Replicas
	}
	return 1
}

// WorkerHealthPort returns the worker health server port.
func (s *TTSWorkerSpec) WorkerHealthPort() int32 {
	if s.HealthPort != 0 {
		return s.HealthPort
	}
	return 8091
}

// ObjectStoreImage returns the object store container image.
func (s *TTSObjectStoreSpec) ObjectStoreImage() string {
	if s.Image != "" {
		return s.Image
	}
	return "chrislusf/seaweedfs:4.21"
}

// StorageSize returns the object store PVC size.
func (s *TTSObjectStoreStorageSpec) StorageSize() string {
	if s.Size != "" {
		return s.Size
	}
	return "5Gi"
}

// APIPort returns the object store S3-compatible API port.
func (s *TTSObjectStorePortsSpec) APIPort() int32 {
	if s.API != 0 {
		return s.API
	}
	return 8333
}

// ConsolePort returns the object store web console port.
func (s *TTSObjectStorePortsSpec) ConsolePort() int32 {
	if s.Console != 0 {
		return s.Console
	}
	return 9333
}

// AccessKeyEnvVar returns the object store access key env-var source for the pod.
func (s *TTSObjectStoreCredentialsSpec) AccessKeyEnvVar() corev1.EnvVar {
	if s.SecretRef != nil {
		return corev1.EnvVar{
			Name: "WEED_S3_ACCESS_KEY",
			ValueFrom: &corev1.EnvVarSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: *s.SecretRef,
					Key:                  "accessKey",
				},
			},
		}
	}
	return corev1.EnvVar{Name: "WEED_S3_ACCESS_KEY", Value: "gamma"}
}

// SecretKeyEnvVar returns the object store secret key env-var source for the pod.
func (s *TTSObjectStoreCredentialsSpec) SecretKeyEnvVar() corev1.EnvVar {
	if s.SecretRef != nil {
		return corev1.EnvVar{
			Name: "WEED_S3_SECRET_KEY",
			ValueFrom: &corev1.EnvVarSource{
				SecretKeyRef: &corev1.SecretKeySelector{
					LocalObjectReference: *s.SecretRef,
					Key:                  "secretKey",
				},
			},
		}
	}
	return corev1.EnvVar{Name: "WEED_S3_SECRET_KEY", Value: "gammalocal"}
}

// BucketNameValue returns the MinIO bucket used for synthesized artifacts.
func (s *TTSConfigSpec) BucketNameValue() string {
	if s.BucketName != "" {
		return s.BucketName
	}
	return "gamma-tts-artifacts"
}

// ModelVersionValue returns the configured TTS model version.
func (s *TTSConfigSpec) ModelVersionValue() string {
	if s.ModelVersion != "" {
		return s.ModelVersion
	}
	return "OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX"
}

// RedisKeyPrefixValue returns the Redis key prefix for TTS state.
func (s *TTSConfigSpec) RedisKeyPrefixValue() string {
	if s.RedisKeyPrefix != "" {
		return s.RedisKeyPrefix
	}
	return "gamma:tts"
}

// RequireWorkerReadyEnabled returns whether API readiness should require a worker heartbeat.
func (s *TTSConfigSpec) RequireWorkerReadyEnabled() bool {
	if s.RequireWorkerReady != nil {
		return *s.RequireWorkerReady
	}
	return true
}

// RequireCustomVoicePackEnabled returns whether API readiness requires packaged custom voice packs.
func (s *TTSConfigSpec) RequireCustomVoicePackEnabled() bool {
	if s.RequireCustomVoicePack != nil {
		return *s.RequireCustomVoicePack
	}
	return false
}

// BucketNameValue returns the object-store bucket used for Audio Overlay clips.
func (s *AudioOverlayObjectStoreSpec) BucketNameValue() string {
	if s.BucketName != "" {
		return s.BucketName
	}
	return "gamma-audio-overlay-clips"
}

// PrefixValue returns the object prefix used for Audio Overlay clips.
func (s *AudioOverlayObjectStoreSpec) PrefixValue() string {
	if s.Prefix != "" {
		trimmed := strings.Trim(s.Prefix, "/")
		if trimmed != "" {
			return trimmed
		}
	}
	return "audio-overlay-clips"
}
