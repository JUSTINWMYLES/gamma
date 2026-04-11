# Gamma Kubernetes Operator — Project Plan

> **Purpose**: This document is the authoritative implementation plan for the
> Gamma Kubernetes operator. It is written to be consumed by an engineer (or an
> AI coding agent) who will implement the operator end-to-end. Every section
> includes the *why*, the *what*, and the *how* in enough detail to go straight
> to code.

---

## Table of Contents

1. [Goals & Non-Goals](#1-goals--non-goals)
2. [Architecture Overview](#2-architecture-overview)
3. [Custom Resource Design — `GammaInstance`](#3-custom-resource-design--gammainstance)
4. [Operator Implementation (kubebuilder)](#4-operator-implementation-kubebuilder)
5. [Helm Chart (Operator Bootstrap)](#5-helm-chart-operator-bootstrap)
6. [WebSocket Sticky Sessions](#6-websocket-sticky-sessions)
7. [Redis Backend for Game State](#7-redis-backend-for-game-state)
8. [Autoscaling (Optional)](#8-autoscaling-optional)
9. [Local Development (`make dev`) Compatibility](#9-local-development-make-dev-compatibility)
10. [Multi-Region & Session Redundancy](#10-multi-region--session-redundancy)
11. [Implementation Checklist](#11-implementation-checklist)
12. [Directory Layout](#12-directory-layout)
13. [Testing Strategy](#13-testing-strategy)

---

## 1. Goals & Non-Goals

### Goals

| # | Goal |
|---|------|
| G1 | A single CRD (`GammaInstance`) that drives the full deployment of Gamma (server, clients, Redis, networking). |
| G2 | A **minimal** Helm chart that installs *only* the operator itself (CRDs, RBAC, Deployment). All game resources are created by the operator. |
| G3 | WebSocket connections survive pod scheduling — sticky sessions ensure an active game room is not interrupted. |
| G4 | Redis is deployed as the game-state backend when running on Kubernetes, managed by the operator. |
| G5 | Autoscaling is **optional** — when omitted from the CR spec the operator deploys a fixed replica count. |
| G6 | `make dev` continues to work for local development with in-memory state (no Redis, no Kubernetes). |
| G7 | Design supports future multi-region deployments and cross-region session redundancy. |
| G8 | The operator is implemented using **kubebuilder** (Go, controller-runtime). |

### Non-Goals

- Per-game CRDs — all games ship in a single container image.
- Running the operator outside Kubernetes (e.g. as a local binary managing Docker).
- Implementing a full service mesh (Istio/Linkerd) — plain Kubernetes primitives are used.
- Implementing multi-region in the first pass (design supports it; implementation is future work).

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  Kubernetes Cluster                                                  │
│                                                                      │
│  ┌─────────────────────────────┐                                     │
│  │  Helm-installed resources   │                                     │
│  │  ┌───────────────────────┐  │                                     │
│  │  │ gamma-operator Pod    │  │  Watches GammaInstance CRs          │
│  │  │ (controller-manager)  │  │                                     │
│  │  └───────────┬───────────┘  │                                     │
│  │  + ServiceAccount, RBAC     │                                     │
│  │  + CRD definitions          │                                     │
│  └──────────────┬──────────────┘                                     │
│                 │                                                     │
│                 │ Reconcile loop creates / manages:                   │
│                 ▼                                                     │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │  Operator-managed resources (per GammaInstance CR)               │ │
│  │                                                                  │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌───────────────────┐  │ │
│  │  │ Gamma Server   │  │ Gamma Client   │  │ Redis             │  │ │
│  │  │ Deployment     │  │ Deployment     │  │ StatefulSet       │  │ │
│  │  │ (Colyseus WS)  │  │ (nginx SPA)    │  │ + PVC             │  │ │
│  │  └───────┬────────┘  └───────┬────────┘  └───────┬───────────┘  │ │
│  │          │                   │                    │              │ │
│  │  ┌───────┴────────┐  ┌──────┴─────────┐  ┌──────┴───────────┐  │ │
│  │  │ Server Service │  │ Client Service │  │ Redis Service    │  │ │
│  │  │ (ClusterIP,    │  │ (ClusterIP)    │  │ (ClusterIP,      │  │ │
│  │  │  sticky sess.) │  │                │  │  headless)       │  │ │
│  │  └───────┬────────┘  └──────┬─────────┘  └──────────────────┘  │ │
│  │          │                  │                                    │ │
│  │  ┌───────┴──────────────────┴──────────┐                        │ │
│  │  │ Ingress (optional)                  │                        │ │
│  │  │ WebSocket-aware, sticky sessions    │                        │ │
│  │  └────────────────────────────────────┘                         │ │
│  │                                                                  │ │
│  │  ┌────────────────────────────────────┐  (optional)             │ │
│  │  │ HorizontalPodAutoscaler           │                          │ │
│  │  │ (targets Server Deployment)       │                          │ │
│  │  └────────────────────────────────────┘                         │ │
│  └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### What the Helm chart installs (minimal)

Only three things:

1. **CRD** — `GammaInstance` custom resource definition
2. **Operator Deployment** — the controller-manager pod + ServiceAccount + RBAC
3. **Leader Election resources** — RBAC for coordination leases

### What the operator creates (per `GammaInstance` CR)

| Resource | Purpose |
|----------|---------|
| `Deployment` (server) | Runs the Gamma Colyseus server pods |
| `Service` (server) | Exposes the WebSocket server with session affinity |
| `Deployment` (client) | Runs nginx pods serving the Svelte SPA |
| `Service` (client) | Exposes the client deployment |
| `StatefulSet` (Redis) | Runs Redis for game state persistence |
| `Service` (Redis) | Headless service for Redis DNS |
| `PersistentVolumeClaim` (Redis) | Data persistence for Redis |
| `ConfigMap` (Redis) | Redis configuration |
| `Ingress` (optional) | External access with WebSocket sticky sessions |
| `HorizontalPodAutoscaler` (optional) | Autoscaling for server pods |

---

## 3. Custom Resource Design — `GammaInstance`

### Why a single CRD?

All games are packaged in a single Docker image release. There is no need for
separate CRDs per game. The `GammaInstance` CR represents a complete Gamma
deployment — server, client frontends, and Redis backend.

### Full CRD Spec

```yaml
apiVersion: gamma.io/v1alpha1
kind: GammaInstance
metadata:
  name: my-gamma
  namespace: gamma
spec:
  # ── Server Configuration ──────────────────────────────────────────
  server:
    image: ghcr.io/gamma/gamma-server:latest  # Required
    replicas: 2                                 # Default: 1
    port: 2567                                  # Default: 2567
    resources:                                  # Optional, sensible defaults
      requests:
        cpu: "100m"
        memory: "128Mi"
      limits:
        cpu: "500m"
        memory: "512Mi"
    env:                                        # Additional env vars
      - name: LOG_LEVEL
        value: "info"
      - name: RECONNECT_GRACE_SECONDS
        value: "30"

  # ── Client Configuration ──────────────────────────────────────────
  client:
    image: ghcr.io/gamma/gamma-client:latest   # Required
    replicas: 2                                 # Default: 1
    resources:
      requests:
        cpu: "50m"
        memory: "32Mi"
      limits:
        cpu: "100m"
        memory: "64Mi"

  # ── Redis Configuration ───────────────────────────────────────────
  redis:
    enabled: true                               # Default: true
    image: redis:7-alpine                       # Default: redis:7-alpine
    resources:
      requests:
        cpu: "100m"
        memory: "128Mi"
      limits:
        cpu: "250m"
        memory: "256Mi"
    storage:
      size: 1Gi                                 # Default: 1Gi
      storageClassName: ""                      # Empty = cluster default

  # ── Networking ────────────────────────────────────────────────────
  networking:
    ingress:
      enabled: false                            # Default: false
      className: nginx                          # Ingress class
      host: gamma.example.com                   # Required if ingress enabled
      tls:
        enabled: false
        secretName: gamma-tls
      annotations: {}                           # Extra ingress annotations

  # ── Autoscaling (optional) ────────────────────────────────────────
  autoscaling:
    enabled: false                              # Default: false
    minReplicas: 1                              # Default: 1
    maxReplicas: 10                             # Default: 10
    targetCPUUtilizationPercentage: 70          # Default: 70
    # Custom metrics support (future):
    # targetWebSocketConnections: 100

status:
  phase: Running                                # Pending | Deploying | Running | Degraded | Failed
  serverReadyReplicas: 2
  clientReadyReplicas: 2
  redisReady: true
  serverEndpoint: "gamma-server.gamma.svc.cluster.local:2567"
  clientEndpoint: "gamma-client.gamma.svc.cluster.local:80"
  redisEndpoint: "gamma-redis.gamma.svc.cluster.local:6379"
  conditions:
    - type: ServerReady
      status: "True"
      lastTransitionTime: "2025-01-15T10:00:00Z"
    - type: ClientReady
      status: "True"
      lastTransitionTime: "2025-01-15T10:00:00Z"
    - type: RedisReady
      status: "True"
      lastTransitionTime: "2025-01-15T10:00:00Z"
  observedGeneration: 1
```

### CRD Validation Rules

| Field | Validation |
|-------|-----------|
| `server.image` | Required, non-empty |
| `client.image` | Required, non-empty |
| `server.replicas` | Min: 1, Max: 100, Default: 1 |
| `client.replicas` | Min: 1, Max: 100, Default: 1 |
| `server.port` | Min: 1024, Max: 65535, Default: 2567 |
| `autoscaling.minReplicas` | Min: 1 |
| `autoscaling.maxReplicas` | Must be >= `minReplicas` |
| `redis.storage.size` | Valid Kubernetes quantity |

### Status Phases

| Phase | Meaning |
|-------|---------|
| `Pending` | CR accepted, operator has not started reconciliation |
| `Deploying` | Operator is creating or updating child resources |
| `Running` | All child resources are healthy and ready |
| `Degraded` | Some child resources are unhealthy (e.g., not all replicas ready) |
| `Failed` | A critical resource failed to deploy |

---

## 4. Operator Implementation (kubebuilder)

### 4.1 Project Scaffolding

```bash
# Initialize the kubebuilder project inside operator/ directory
cd operator/
kubebuilder init --domain gamma.io --repo github.com/gamma/gamma-operator

# Create the GammaInstance API
kubebuilder create api --group gamma --version v1alpha1 --kind GammaInstance \
  --resource --controller
```

This generates:
- `operator/api/v1alpha1/gammainstance_types.go` — Go types for the CRD spec/status
- `operator/internal/controller/gammainstance_controller.go` — Reconciler skeleton
- `operator/config/` — kubebuilder-managed Kustomize manifests (CRDs, RBAC, manager)

### 4.2 Type Definitions

**File**: `operator/api/v1alpha1/gammainstance_types.go`

```go
package v1alpha1

import (
    corev1 "k8s.io/api/core/v1"
    metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// GammaInstanceSpec defines the desired state of a Gamma deployment.
type GammaInstanceSpec struct {
    Server      ServerSpec      `json:"server"`
    Client      ClientSpec      `json:"client"`
    Redis       RedisSpec       `json:"redis,omitempty"`
    Networking  NetworkingSpec  `json:"networking,omitempty"`
    Autoscaling *AutoscalingSpec `json:"autoscaling,omitempty"`
}

type ServerSpec struct {
    Image     string                      `json:"image"`
    Replicas  *int32                      `json:"replicas,omitempty"`  // +kubebuilder:default=1
    Port      int32                       `json:"port,omitempty"`     // +kubebuilder:default=2567
    Resources corev1.ResourceRequirements `json:"resources,omitempty"`
    Env       []corev1.EnvVar            `json:"env,omitempty"`
}

type ClientSpec struct {
    Image     string                      `json:"image"`
    Replicas  *int32                      `json:"replicas,omitempty"` // +kubebuilder:default=1
    Resources corev1.ResourceRequirements `json:"resources,omitempty"`
}

type RedisSpec struct {
    Enabled          *bool                       `json:"enabled,omitempty"`  // +kubebuilder:default=true
    Image            string                      `json:"image,omitempty"`   // +kubebuilder:default="redis:7-alpine"
    Resources        corev1.ResourceRequirements `json:"resources,omitempty"`
    Storage          RedisStorageSpec             `json:"storage,omitempty"`
}

type RedisStorageSpec struct {
    Size             string `json:"size,omitempty"`             // +kubebuilder:default="1Gi"
    StorageClassName string `json:"storageClassName,omitempty"`
}

type NetworkingSpec struct {
    Ingress IngressSpec `json:"ingress,omitempty"`
}

type IngressSpec struct {
    Enabled     bool              `json:"enabled,omitempty"`
    ClassName   string            `json:"className,omitempty"`
    Host        string            `json:"host,omitempty"`
    TLS         IngressTLSSpec    `json:"tls,omitempty"`
    Annotations map[string]string `json:"annotations,omitempty"`
}

type IngressTLSSpec struct {
    Enabled    bool   `json:"enabled,omitempty"`
    SecretName string `json:"secretName,omitempty"`
}

type AutoscalingSpec struct {
    Enabled                        bool  `json:"enabled"`
    MinReplicas                    int32 `json:"minReplicas,omitempty"` // +kubebuilder:default=1
    MaxReplicas                    int32 `json:"maxReplicas,omitempty"` // +kubebuilder:default=10
    TargetCPUUtilizationPercentage int32 `json:"targetCPUUtilizationPercentage,omitempty"` // +kubebuilder:default=70
}

// GammaInstanceStatus defines the observed state of a Gamma deployment.
type GammaInstanceStatus struct {
    Phase               string                 `json:"phase,omitempty"`
    ServerReadyReplicas int32                  `json:"serverReadyReplicas,omitempty"`
    ClientReadyReplicas int32                  `json:"clientReadyReplicas,omitempty"`
    RedisReady          bool                   `json:"redisReady,omitempty"`
    ServerEndpoint      string                 `json:"serverEndpoint,omitempty"`
    ClientEndpoint      string                 `json:"clientEndpoint,omitempty"`
    RedisEndpoint       string                 `json:"redisEndpoint,omitempty"`
    Conditions          []metav1.Condition     `json:"conditions,omitempty"`
    ObservedGeneration  int64                  `json:"observedGeneration,omitempty"`
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
```

### 4.3 Reconciler Logic

**File**: `operator/internal/controller/gammainstance_controller.go`

The reconciler follows a **single-pass idempotent** pattern. On each
reconciliation it ensures all child resources match the desired state.

```
Reconcile(GammaInstance)
│
├── 1. Set status to "Deploying" if first reconcile
│
├── 2. Reconcile Redis (if enabled)
│   ├── Ensure ConfigMap (redis.conf)
│   ├── Ensure StatefulSet (1 replica)
│   ├── Ensure headless Service
│   └── Wait for StatefulSet ready
│
├── 3. Reconcile Server Deployment
│   ├── Build Deployment spec
│   │   ├── Set image, replicas, port, resources
│   │   ├── Inject REDIS_URL env var (if Redis enabled)
│   │   ├── Inject user-supplied env vars
│   │   └── Set pod anti-affinity (prefer spread)
│   ├── Create or Update Deployment (using controllerutil.CreateOrUpdate)
│   └── Ensure Service with sessionAffinity: ClientIP
│
├── 4. Reconcile Client Deployment
│   ├── Build Deployment spec
│   │   ├── Set image, replicas, resources
│   │   └── Inject runtime GAMMA_SERVER_URL or derive it from ingress host
│   ├── Create or Update Deployment
│   └── Ensure Service (ClusterIP)
│
├── 5. Reconcile Ingress (if enabled)
│   ├── Build Ingress with WebSocket annotations
│   ├── Configure sticky sessions at ingress level
│   ├── Route /ws → server Service
│   └── Route / → client Service
│
├── 6. Reconcile HPA (if autoscaling enabled)
│   ├── Create or Update HPA targeting server Deployment
│   └── If autoscaling disabled, delete existing HPA
│
├── 7. Update status
│   ├── Aggregate ready replicas from all Deployments
│   ├── Check Redis StatefulSet readiness
│   ├── Set phase (Running / Degraded / Failed)
│   ├── Update conditions
│   └── Set observedGeneration
│
└── 8. Requeue after 30s (periodic health check)
```

### 4.4 Owner References & Garbage Collection

All child resources are created with an **OwnerReference** pointing to the
`GammaInstance` CR. This means:

- When the CR is deleted, Kubernetes garbage-collects all child resources
  automatically.
- No finalizers are needed for basic cleanup.
- The operator should set `controller: true` and `blockOwnerDeletion: true` on
  the owner reference.

Use `controllerutil.SetControllerReference(instance, childResource, scheme)` to
set this automatically.

### 4.5 Resource Naming Convention

All child resources use a consistent naming pattern:

| Resource | Name Pattern | Example |
|----------|-------------|---------|
| Server Deployment | `{instance.name}-server` | `my-gamma-server` |
| Server Service | `{instance.name}-server` | `my-gamma-server` |
| Client Deployment | `{instance.name}-client` | `my-gamma-client` |
| Client Service | `{instance.name}-client` | `my-gamma-client` |
| Redis StatefulSet | `{instance.name}-redis` | `my-gamma-redis` |
| Redis Service | `{instance.name}-redis` | `my-gamma-redis` |
| Redis ConfigMap | `{instance.name}-redis-config` | `my-gamma-redis-config` |
| Redis PVC | `data-{instance.name}-redis-0` | `data-my-gamma-redis-0` |
| Ingress | `{instance.name}` | `my-gamma` |
| HPA | `{instance.name}-server` | `my-gamma-server` |

### 4.6 Labels & Selectors

All resources managed by the operator carry these labels:

```yaml
labels:
  app.kubernetes.io/name: gamma
  app.kubernetes.io/instance: my-gamma           # from CR metadata.name
  app.kubernetes.io/component: server|client|redis
  app.kubernetes.io/managed-by: gamma-operator
  gamma.io/instance: my-gamma                     # for easy querying
```

---

## 5. Helm Chart (Operator Bootstrap)

The Helm chart installs **only** the operator. It is intentionally minimal.

### Chart Contents

```
helm/gamma-operator/
├── Chart.yaml
├── values.yaml
├── templates/
│   ├── _helpers.tpl
│   ├── serviceaccount.yaml
│   ├── clusterrole.yaml
│   ├── clusterrolebinding.yaml
│   ├── deployment.yaml
│   └── crds/
│       └── gamma.io_gammainstances.yaml   # CRD definition
```

### What the Chart Creates

1. **CRD**: `gammainstances.gamma.io` — installed as a template under `templates/crds/`
   so `helm install` registers it.
2. **ServiceAccount**: `gamma-operator` in the release namespace.
3. **ClusterRole**: Permissions to manage GammaInstance CRs + child resources
   (Deployments, Services, StatefulSets, PVCs, ConfigMaps, Ingresses, HPAs).
4. **ClusterRoleBinding**: Binds the ClusterRole to the ServiceAccount.
5. **Deployment**: Single-replica controller-manager pod.

That's it — no Services, no Ingresses, no ConfigMaps for the operator itself.

### CRD Installation Strategy

The CRD YAML is generated by kubebuilder (`make manifests`) and copied into the
Helm chart at `templates/crds/`. We place it in `templates/crds/` rather than
the Helm `crds/` directory so it is managed by Helm lifecycle (upgrades delete
the old CRD definition and apply the new one).

> **Note**: Using `templates/crds/` means the CRD is subject to Helm's
> template rendering. Wrap the CRD file with `{{- if .Values.crds.install }}`
> so users who manage CRDs externally can disable this.

### values.yaml (complete)

```yaml
image:
  repository: ghcr.io/gamma/gamma-operator
  tag: latest
  pullPolicy: IfNotPresent

replicaCount: 1

serviceAccount:
  create: true
  name: gamma-operator
  annotations: {}

rbac:
  create: true

crds:
  install: true

resources:
  requests:
    cpu: 50m
    memory: 64Mi
  limits:
    cpu: 200m
    memory: 256Mi

leaderElection:
  enabled: true

metrics:
  enabled: true
  port: 8080

logLevel: info

podSecurityContext:
  runAsNonRoot: true
  runAsUser: 65532
  fsGroup: 65532

securityContext:
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: [ALL]

nodeSelector: {}
tolerations: []
affinity: {}
```

---

## 6. WebSocket Sticky Sessions

Gamma uses Colyseus over WebSockets. A game session (room) lives in a specific
server process. If a client's WebSocket connection is routed to a different pod,
the connection is lost and the player is dropped from the game.

### Solution: Multi-Layer Session Affinity

#### Layer 1: Kubernetes Service (always applied)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-gamma-server
spec:
  type: ClusterIP
  sessionAffinity: ClientIP
  sessionAffinityConfig:
    clientIP:
      timeoutSeconds: 3600   # 1 hour — covers a full game session
  ports:
    - port: 2567
      targetPort: 2567
      protocol: TCP
  selector:
    app.kubernetes.io/name: gamma
    app.kubernetes.io/instance: my-gamma
    app.kubernetes.io/component: server
```

`sessionAffinity: ClientIP` ensures that once a client connects to a pod, all
subsequent connections from the same IP go to the same pod. The 1-hour timeout
covers even the longest game sessions.

#### Layer 2: Ingress (when external access is enabled)

The Ingress must also maintain sticky sessions. The operator sets these
annotations automatically based on the ingress class:

**nginx ingress controller**:
```yaml
annotations:
  nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
  nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
  nginx.ingress.kubernetes.io/upstream-hash-by: "$remote_addr"
  nginx.ingress.kubernetes.io/affinity: "cookie"
  nginx.ingress.kubernetes.io/affinity-mode: "persistent"
  nginx.ingress.kubernetes.io/session-cookie-name: "gamma-sticky"
  nginx.ingress.kubernetes.io/session-cookie-max-age: "3600"
  nginx.ingress.kubernetes.io/proxy-http-version: "1.1"
  nginx.ingress.kubernetes.io/connection-proxy-header: "keep-alive"
```

These annotations ensure:
- WebSocket upgrade requests are properly proxied
- Timeouts are long enough for game sessions (1 hour)
- Cookie-based affinity is used for reliable session stickiness (more reliable
  than IP-based for clients behind NAT)

#### Layer 3: Colyseus Reconnection (application level)

Gamma already implements name-based reconnection in the Colyseus room (see
`server/src/rooms/GammaRoom.ts`). If a WebSocket disconnects and the client
reconnects within the grace period (`RECONNECT_GRACE_SECONDS`, default 30s),
the player is restored to their previous state. This is the last line of
defense if infrastructure-level stickiness fails.

### Scale-Down Considerations

When scaling down, active WebSocket connections on the removed pod will be
terminated. To minimize disruption:

1. The server Deployment uses `maxUnavailable: 0` in its rolling update
   strategy.
2. A `preStop` hook gives the server process time to notify connected clients:
   ```yaml
   lifecycle:
     preStop:
       exec:
         command: ["sh", "-c", "sleep 15"]
   ```
3. `terminationGracePeriodSeconds: 60` allows in-flight game rounds to
   complete.
4. When autoscaling is enabled, the HPA `scaleDown` stabilization window
   prevents thrashing.

---

## 7. Redis Backend for Game State

### Why Redis?

In a multi-pod Kubernetes deployment, game state cannot live in a single
process's memory. Redis provides:

- **Shared state**: All server pods can read/write game room state.
- **Presence**: Colyseus' presence API can use Redis to track which rooms exist
  across all pods.
- **Pub/Sub**: Inter-pod communication for room events.

### Redis Architecture

```
┌─────────────────────────────────┐
│  StatefulSet: my-gamma-redis    │
│  ┌───────────────────────────┐  │
│  │  redis:7-alpine           │  │
│  │  Port 6379                │  │
│  │  appendonly yes           │  │
│  │  maxmemory 200mb         │  │
│  │  maxmemory-policy allkeys-lru │
│  └─────────┬─────────────────┘  │
│            │                    │
│  ┌─────────▼─────────────────┐  │
│  │  PVC: data (1Gi default)  │  │
│  └───────────────────────────┘  │
└─────────────────────────────────┘
```

### Redis ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-gamma-redis-config
data:
  redis.conf: |
    appendonly yes
    appendfsync everysec
    maxmemory 200mb
    maxmemory-policy allkeys-lru
    tcp-keepalive 60
    timeout 300
```

### Server Environment Injection

When Redis is enabled, the operator injects:

```yaml
env:
  - name: REDIS_URL
    value: "redis://my-gamma-redis.gamma.svc.cluster.local:6379"
  - name: STATE_BACKEND
    value: "redis"
```

When Redis is **not** enabled (or running locally via `make dev`):

```yaml
env:
  - name: STATE_BACKEND
    value: "memory"
```

### Server Code Changes Required

The Gamma server must support a backend abstraction. The changes needed in the
server codebase:

1. **`server/src/config.ts`** (new file) — Read `STATE_BACKEND` and `REDIS_URL`
   from environment:
   ```typescript
   export const config = {
     stateBackend: process.env.STATE_BACKEND ?? "memory",
     redisUrl: process.env.REDIS_URL ?? undefined,
   };
   ```

2. **`server/src/index.ts`** — Conditionally configure Colyseus with Redis
   presence and driver:
   ```typescript
   import { RedisPresence } from "@colyseus/redis-presence";
   import { RedisDriver } from "@colyseus/redis-driver";
   import { config } from "./config";

   const serverOptions: any = {
     transport: new WebSocketTransport({ server: httpServer, ... }),
   };

   if (config.stateBackend === "redis" && config.redisUrl) {
     serverOptions.presence = new RedisPresence({ url: config.redisUrl });
     serverOptions.driver = new RedisDriver({ url: config.redisUrl });
     console.log(`[gamma] Using Redis backend: ${config.redisUrl}`);
   } else {
     console.log(`[gamma] Using in-memory backend`);
   }

   const gameServer = new Server(serverOptions);
   ```

3. **No changes to game logic** — The BaseGame and all game plugins operate on
   Colyseus Schema state, which is backend-agnostic. Redis vs. memory is
   transparent to game code.

### Local Development

`make dev` works unchanged because:
- `STATE_BACKEND` defaults to `"memory"` when not set.
- `REDIS_URL` is undefined, so the Redis presence/driver is not instantiated.
- No Redis process is needed locally.

---

## 8. Autoscaling (Optional)

Autoscaling is **opt-in**. When `spec.autoscaling` is omitted or
`spec.autoscaling.enabled` is `false`, the operator creates a fixed-replica
Deployment and no HPA.

### When Enabled

The operator creates an HPA targeting the server Deployment:

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: my-gamma-server
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: my-gamma-server
  minReplicas: 1       # from spec.autoscaling.minReplicas
  maxReplicas: 10      # from spec.autoscaling.maxReplicas
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70  # from spec.autoscaling.targetCPUUtilizationPercentage
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300  # 5 min cooldown before scale-down
      policies:
        - type: Pods
          value: 1
          periodSeconds: 60
    scaleUp:
      stabilizationWindowSeconds: 30
      policies:
        - type: Pods
          value: 2
          periodSeconds: 60
```

### Scale-Down Safety

The HPA `scaleDown` behavior is conservative:
- **5-minute stabilization window** prevents rapid scale-down during brief
  traffic dips.
- **1 pod per minute** scale-down rate gives active sessions time to complete.
- Combined with sticky sessions, most players finish their game before the pod
  is removed.

### Constrained Scenarios

For constrained environments (small clusters, dev, cost-sensitive):

```yaml
spec:
  server:
    replicas: 1
  autoscaling:
    enabled: false
```

This creates exactly one server pod with no HPA overhead.

### When Autoscaling is Toggled

The reconciler handles transitions:
- **Disabled → Enabled**: Create HPA, set `spec.replicas` on the Deployment to
  match `minReplicas`.
- **Enabled → Disabled**: Delete the HPA, set `spec.replicas` on the Deployment
  to the CR's `spec.server.replicas` value.

---

## 9. Local Development (`make dev`) Compatibility

The operator design preserves the existing local development workflow.

### How It Works Today

```bash
make dev
# Runs concurrently:
#   1. Server (Colyseus) — port 2567, in-memory state
#   2. TV client — Vite dev server, port 5173
#   3. Phone client — Vite dev server, port 5174
```

### What Changes

| Aspect | Local (`make dev`) | Kubernetes (operator) |
|--------|-------------------|----------------------|
| State backend | In-memory (default) | Redis |
| Server replicas | 1 process | N pods |
| Client serving | Vite dev server | nginx in pod |
| Networking | localhost ports | K8s Services + Ingress |
| Configuration | `.env` file | `GammaInstance` CR spec |

### Design Principle: Environment-Driven Configuration

All operator-specific behavior is gated on environment variables:

```
STATE_BACKEND=memory    → In-memory (default, local dev)
STATE_BACKEND=redis     → Redis backend (k8s)
REDIS_URL=redis://...   → Redis connection string
```

The server code checks these at startup. No code paths are removed — the
in-memory path remains the default. This means:

- `make dev` works with zero configuration changes.
- Docker Compose works with zero changes (in-memory mode).
- Kubernetes gets Redis through operator-injected env vars.

### docker-compose.yml

No changes needed. Docker Compose continues to use the in-memory backend. Users
who want to test Redis locally can optionally add a Redis service to their
compose file and set `STATE_BACKEND=redis`.

---

## 10. Multi-Region & Session Redundancy

> **Note**: Multi-region is a **design consideration** for the future, not a
> first-pass implementation requirement. The CRD and operator are designed to
> support it without breaking changes.

### Multi-Region Architecture

```
                    ┌─────────────────────┐
                    │  Global DNS / LB    │
                    │  (geo-aware)        │
                    └─────────┬───────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ Region A   │  │ Region B   │  │ Region C   │
     │ (us-east)  │  │ (eu-west)  │  │ (ap-south) │
     │            │  │            │  │            │
     │ GammaInst. │  │ GammaInst. │  │ GammaInst. │
     │ ┌────────┐ │  │ ┌────────┐ │  │ ┌────────┐ │
     │ │ Server │ │  │ │ Server │ │  │ │ Server │ │
     │ │ Client │ │  │ │ Client │ │  │ │ Client │ │
     │ │ Redis  │ │  │ │ Redis  │ │  │ │ Redis  │ │
     │ └────────┘ │  │ └────────┘ │  │ └────────┘ │
     └──────┬─────┘  └──────┬─────┘  └──────┬─────┘
            │               │               │
            └───────────────┴───────────────┘
                    Redis cross-region
                    replication (future)
```

### How It Scales Out

1. **Per-Region `GammaInstance` CRs**: Each region gets its own `GammaInstance`
   resource. The operator in each cluster manages that region's deployment
   independently.

2. **Global DNS**: A geo-aware DNS service (e.g., Route 53 latency-based
   routing, Cloudflare load balancing) routes players to the nearest region.

3. **Independent Game Sessions**: Game rooms are region-local. A room created in
   `us-east` lives entirely in `us-east`. Players in the same game session
   must connect to the same region.

4. **Room Discovery Across Regions**: If a player in `eu-west` wants to join a
   room code that was created in `us-east`, the client needs to be redirected.
   This is handled by:
   - A lightweight **room registry service** (future) that maps room codes to
     region endpoints.
   - Or, embed the region in the room code (e.g., `ABCD-USE`) so the client
     knows which regional endpoint to connect to.

### Session Redundancy

| Strategy | Description | Complexity | Data Loss Risk |
|----------|-------------|-----------|----------------|
| **Active-Passive Redis** | Redis in each region replicates to a standby. On failure, standby is promoted. | Medium | Minimal (async replication lag) |
| **Redis Cluster with Cross-Region Replication** | Redis Sentinel or Redis Cluster with replicas in other regions. | High | Near-zero |
| **Session Checkpointing** | Periodic game state snapshots to an object store (S3). On failure, restore from snapshot in another region. | Medium | Up to checkpoint interval |
| **No Cross-Region Redundancy** (recommended for v1) | Each region is independent. If a region fails, those sessions are lost. Players rejoin in another region. | Low | Active sessions in failed region |

### Recommended v1 Approach

For the initial implementation:

1. **No cross-region replication** — each region is self-contained.
2. **Redis persistence** within each region via AOF (append-only file) on PVC.
3. **Pod-level redundancy** — multiple server replicas per region. If one pod
   dies, new rooms are created on surviving pods. In-flight rooms on the dead
   pod are lost, but Colyseus reconnection handles transient disconnects.
4. **Region metadata in CR** — add an optional `spec.region` field for labeling:
   ```yaml
   spec:
     region: us-east-1  # Informational, used by future federation
   ```

### Future Multi-Region Enhancements

These can be added without CRD breaking changes:

- `spec.redis.replication` — configure cross-region Redis replication.
- `spec.federation` — link multiple `GammaInstance` deployments together for
  room discovery.
- A **GammaFederation** CRD (new, additive) that references multiple
  `GammaInstance` CRs across clusters for centralized room routing.

---

## 11. Implementation Checklist

This is the ordered list of tasks to implement the operator. Each task builds
on the previous one.

### Phase 1: Operator Scaffolding

- [ ] Create `operator/` directory at the repository root.
- [ ] Initialize kubebuilder project:
  ```bash
  cd operator/
  kubebuilder init --domain gamma.io --repo github.com/gamma/gamma-operator
  ```
- [ ] Create the `GammaInstance` API:
  ```bash
  kubebuilder create api --group gamma --version v1alpha1 --kind GammaInstance \
    --resource --controller
  ```
- [ ] Implement `GammaInstanceSpec` and `GammaInstanceStatus` types in
  `api/v1alpha1/gammainstance_types.go` as defined in Section 4.2.
- [ ] Add kubebuilder markers for validation, defaults, and printer columns.
- [ ] Run `make manifests` to generate CRD YAML.
- [ ] Run `make generate` to generate DeepCopy methods.
- [ ] Verify CRD generation: `kubectl apply --dry-run=client -f config/crd/bases/`.

### Phase 2: Reconciler — Redis

- [ ] Implement Redis ConfigMap reconciliation (create/update `redis.conf`
  ConfigMap).
- [ ] Implement Redis StatefulSet reconciliation (single replica, PVC,
  `redis:7-alpine` image).
- [ ] Implement Redis headless Service reconciliation.
- [ ] Add `RedisReady` condition to status update.
- [ ] Write unit tests for Redis reconciliation (using envtest).
- [ ] Skip Redis resources entirely when `spec.redis.enabled` is `false`.

### Phase 3: Reconciler — Server

- [ ] Implement server Deployment reconciliation:
  - Set image, replicas, port, resources from CR spec.
  - Inject `REDIS_URL` and `STATE_BACKEND` env vars when Redis is enabled.
  - Inject user-supplied env vars from `spec.server.env`.
  - Set pod anti-affinity for spread scheduling.
  - Set `preStop` hook and `terminationGracePeriodSeconds`.
- [ ] Implement server Service reconciliation:
  - `sessionAffinity: ClientIP`
  - `sessionAffinityConfig.clientIP.timeoutSeconds: 3600`
- [ ] Add `ServerReady` condition to status update.
- [ ] Write unit tests for server reconciliation.

### Phase 4: Reconciler — Client

- [ ] Implement client Deployment reconciliation:
  - Set image, replicas, resources from CR spec.
  - Inject runtime `GAMMA_SERVER_URL` from `spec.client.serverUrl` or derive it from ingress.
- [ ] Implement client Service reconciliation.
- [ ] Add `ClientReady` condition to status update.
- [ ] Write unit tests for client reconciliation.

### Phase 5: Reconciler — Networking

- [ ] Implement Ingress reconciliation (when `spec.networking.ingress.enabled`):
  - Set WebSocket-aware annotations for nginx ingress.
  - Configure sticky session annotations.
  - Route `/ws` path to server Service, `/` to client Service.
  - Handle TLS if configured.
- [ ] Implement Ingress cleanup when disabled.
- [ ] Write unit tests for Ingress reconciliation.

### Phase 6: Reconciler — Autoscaling

- [ ] Implement HPA reconciliation when `spec.autoscaling.enabled`:
  - Target server Deployment.
  - Set min/max replicas and CPU target.
  - Configure conservative scale-down behavior.
- [ ] Implement HPA cleanup when autoscaling is disabled.
- [ ] When HPA is active, do NOT set `spec.replicas` on the server Deployment
  (let HPA control it).
- [ ] Write unit tests for HPA reconciliation.

### Phase 7: Status & Phase Management

- [ ] Implement comprehensive status updates:
  - Aggregate ready replicas from server and client Deployments.
  - Check Redis StatefulSet readiness.
  - Compute overall phase (Pending → Deploying → Running → Degraded → Failed).
  - Set `observedGeneration` to detect spec changes.
- [ ] Implement status conditions for each component.
- [ ] Add periodic requeue (30s) for continuous health monitoring.

### Phase 8: Helm Chart

- [ ] Copy generated CRD from `operator/config/crd/bases/` to
  `helm/gamma-operator/templates/crds/`.
- [ ] Update `helm/gamma-operator/templates/deployment.yaml` to deploy the
  operator controller-manager.
- [ ] Create `helm/gamma-operator/templates/clusterrole.yaml` with required RBAC
  permissions.
- [ ] Create `helm/gamma-operator/templates/clusterrolebinding.yaml`.
- [ ] Update `helm/gamma-operator/templates/serviceaccount.yaml`.
- [ ] Update `helm/gamma-operator/values.yaml` as defined in Section 5.
- [ ] Remove any templates not needed for the minimal chart.
- [ ] Verify with `helm lint helm/gamma-operator`.
- [ ] Verify with `helm template gamma-operator helm/gamma-operator`.

### Phase 9: Server Code Changes

- [ ] Create `server/src/config.ts` with `STATE_BACKEND` and `REDIS_URL`
  config.
- [ ] Install `@colyseus/redis-presence` and `@colyseus/redis-driver` as
  optional dependencies.
- [ ] Update `server/src/index.ts` to conditionally use Redis presence and
  driver.
- [ ] Verify `make dev` still works (in-memory mode, no Redis).
- [ ] Verify Docker Compose still works.
- [ ] Write a test that verifies config defaults to in-memory mode.

### Phase 10: Integration Testing

- [ ] Write integration tests using kubebuilder's envtest framework:
  - Create a `GammaInstance` CR and verify all child resources are created.
  - Update the CR and verify child resources are updated.
  - Delete the CR and verify garbage collection.
  - Test autoscaling enable/disable toggling.
  - Test Redis enable/disable.
- [ ] Write a smoke test script that:
  - Deploys the operator to a kind cluster.
  - Applies a sample `GammaInstance` CR.
  - Waits for status to become `Running`.
  - Verifies all expected resources exist.

### Phase 11: Documentation & Cleanup

- [ ] Update `k8s/examples/` with new `GammaInstance` example CRs.
- [ ] Remove stale CRD files from `k8s/crds/` (replaced by kubebuilder-generated
  CRDs).
- [ ] Remove stale `k8s/rbac.yaml` (replaced by Helm chart RBAC templates).
- [ ] Update `Makefile` with operator build/test targets.
- [ ] Update `README.md` with operator installation instructions.
- [ ] Update `.env.example` with new environment variables.

---

## 12. Directory Layout

After implementation, the repository structure will be:

```
gamma/
├── operator/                              # NEW — kubebuilder project
│   ├── Dockerfile                         # Multi-stage build for operator binary
│   ├── Makefile                           # kubebuilder-generated Makefile
│   ├── PROJECT                            # kubebuilder project metadata
│   ├── go.mod
│   ├── go.sum
│   ├── cmd/
│   │   └── main.go                        # Operator entry point
│   ├── api/
│   │   └── v1alpha1/
│   │       ├── gammainstance_types.go     # CRD Go types
│   │       ├── groupversion_info.go
│   │       └── zz_generated.deepcopy.go   # Generated
│   ├── internal/
│   │   └── controller/
│   │       ├── gammainstance_controller.go # Reconciler
│   │       ├── redis.go                   # Redis reconciliation helpers
│   │       ├── server.go                  # Server reconciliation helpers
│   │       ├── client.go                  # Client reconciliation helpers
│   │       ├── networking.go              # Ingress reconciliation helpers
│   │       ├── autoscaling.go             # HPA reconciliation helpers
│   │       └── gammainstance_controller_test.go
│   └── config/                            # kubebuilder Kustomize config
│       ├── crd/
│       │   └── bases/
│       │       └── gamma.gamma.io_gammainstances.yaml
│       ├── manager/
│       ├── rbac/
│       └── default/
│
├── helm/
│   └── gamma-operator/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
│           ├── _helpers.tpl
│           ├── serviceaccount.yaml
│           ├── clusterrole.yaml
│           ├── clusterrolebinding.yaml
│           ├── deployment.yaml
│           └── crds/
│               └── gamma.io_gammainstances.yaml
│
├── k8s/
│   └── examples/
│       ├── basic.yaml                     # Minimal GammaInstance
│       ├── production.yaml                # Full-featured GammaInstance
│       └── constrained.yaml               # Minimal resources, no autoscaling
│
├── server/                                # Existing — minor changes
│   └── src/
│       ├── config.ts                      # NEW — environment config
│       └── index.ts                       # Modified — Redis conditional setup
│
├── Makefile                               # Updated — operator targets
└── docs/
    └── k8s-operator-design.md             # This file
```

---

## 13. Testing Strategy

### Unit Tests (Go — operator)

Use kubebuilder's **envtest** framework for controller tests:

```go
// Example test structure
var _ = Describe("GammaInstance Controller", func() {
    Context("When creating a GammaInstance", func() {
        It("Should create server Deployment", func() { ... })
        It("Should create server Service with sticky sessions", func() { ... })
        It("Should create client Deployment", func() { ... })
        It("Should create Redis StatefulSet when enabled", func() { ... })
        It("Should NOT create Redis resources when disabled", func() { ... })
        It("Should create HPA when autoscaling enabled", func() { ... })
        It("Should NOT create HPA when autoscaling disabled", func() { ... })
        It("Should create Ingress when enabled", func() { ... })
        It("Should set status to Running when all resources ready", func() { ... })
    })

    Context("When updating a GammaInstance", func() {
        It("Should update server image", func() { ... })
        It("Should scale server replicas", func() { ... })
        It("Should toggle autoscaling", func() { ... })
    })

    Context("When deleting a GammaInstance", func() {
        It("Should garbage collect all child resources", func() { ... })
    })
})
```

### Unit Tests (TypeScript — server)

Verify the config module defaults:

```typescript
describe("config", () => {
  it("defaults to memory backend", () => {
    delete process.env.STATE_BACKEND;
    const { config } = require("./config");
    expect(config.stateBackend).toBe("memory");
  });

  it("reads redis backend from env", () => {
    process.env.STATE_BACKEND = "redis";
    process.env.REDIS_URL = "redis://localhost:6379";
    const { config } = require("./config");
    expect(config.stateBackend).toBe("redis");
    expect(config.redisUrl).toBe("redis://localhost:6379");
  });
});
```

### Integration Tests (kind cluster)

A shell script that:

1. Creates a kind cluster.
2. Builds and loads the operator image.
3. Installs the Helm chart.
4. Applies a test `GammaInstance` CR.
5. Waits for status `Running`.
6. Verifies all expected resources exist.
7. Cleans up.

This can be run in CI or locally with `make test-operator-integration`.
