# ADR-007: Kubernetes Operator Design and Redis for Game State

**Date:** 2025-07
**Status:** Active

## Context

Gamma needs a way to deploy to Kubernetes so it can run reliably in cloud or
self-hosted environments. The core challenge is that Gamma is composed of three
tightly coupled components — a Colyseus game server, a static-asset client, and
a shared state store — that all need to be configured together consistently. A
plain Helm chart for the full application would require operators to understand
and coordinate many interdependent values; a Kubernetes operator can encode that
coordination automatically.

Additionally, Colyseus maintains in-memory game state (rooms, player sessions,
scores). When running more than one server replica — necessary for availability —
those replicas need a shared state backend so that a player's request can be
served by any pod without losing their session.

Options considered for deployment packaging:
1. **Plain Helm chart** — all three components parameterised in one chart
2. **Kustomize overlays** — base manifests plus environment patches
3. **Kubernetes Operator (controller-runtime)** — a CRD-driven control loop that
   owns the lifecycle of all three components

Options considered for shared game state:
1. **In-memory only** — single replica, state lives in the Node.js process
2. **Redis** — fast, purpose-built key-value store widely supported by game
   networking frameworks
3. **PostgreSQL** — full relational database, higher operational overhead

## Decision

### Deployment: Kubernetes Operator

Build a Kubernetes operator using
[controller-runtime](https://github.com/kubernetes-sigs/controller-runtime)
(kubebuilder scaffolding) with a single `GammaInstance` CRD that drives the
lifecycle of the server, client, and Redis components.

A small Helm chart (`helm/gamma-operator/`) installs only the operator itself
(Deployment + RBAC + CRD). The operator then creates and manages all game
resources in response to `GammaInstance` CR changes.

### State Backend: Redis

Use Redis as the shared state backend for Colyseus when running in Kubernetes.
The operator deploys a Redis StatefulSet alongside the server pods and injects
`STATE_BACKEND=redis` and `REDIS_URL` into the server containers automatically.
Redis remains optional; users can set `redis.enabled: false` to fall back to
single-replica in-memory mode.

## Rationale

### Why an operator over a plain Helm chart?

- **Encodes operational knowledge.** The controller reconciles desired → actual
  state continuously. If a Deployment is accidentally deleted it is re-created;
  if a Service is misconfigured it is corrected on the next reconcile.
- **Reduces configuration surface.** Users declare *what* they want (`image`,
  `replicas`, `host`) rather than *how* to wire it up. The operator derives
  `REDIS_URL`, `VITE_SERVER_URL`, ingress annotations, sticky-session config,
  etc. from the single CR.
- **Lifecycle coupling.** All child resources (Deployments, StatefulSet, Service,
  Ingress, HPA) are owned by the `GammaInstance` via owner references, so
  deleting the CR cleans up everything automatically.
- **Status feedback.** The operator aggregates component health into
  `GammaInstance.status.phase` (`Running`, `Deploying`, `Degraded`, `Failed`),
  giving operators a single place to observe deployment health.

### Why controller-runtime (not a raw operator SDK or plain controller)?

- controller-runtime provides a high-level `createOrUpdate` primitive, scheme
  registration, leader election, and metrics integration with minimal boilerplate.
- It is the standard library used by kubebuilder-generated operators and is
  well-maintained by sig-controller-runtime.
- Pure Go: no code generation step required beyond `controller-gen` for deep-copy
  and CRD manifests, which are checked in alongside the Go source.

### Why Redis for game state?

- **Colyseus compatibility.** Colyseus has first-class support for Redis as a
  presence/state backend via `RedisPresence`. The server already checks the
  `STATE_BACKEND` and `REDIS_URL` environment variables to switch between
  in-memory and Redis modes.
- **Low latency.** Redis serves sub-millisecond reads/writes over a local
  cluster network, meeting the real-time requirements of game state synchronisation
  (room membership, scores, phase).
- **Operational simplicity.** A single-node Redis StatefulSet with a small
  PersistentVolumeClaim is sufficient for Gamma's workload. No sharding, no
  complex replication topology needed.
- **Persistence optional.** The operator configures Redis with `appendonly yes`
  so state survives pod restarts during rolling updates. The storage size is
  configurable in the CR (`redis.storage.size`).
- **Widely available.** The `redis:7-alpine` image is available on Docker Hub and
  most private registries. No additional vendor dependencies.
- **PostgreSQL rejected** because it introduces schema migrations, connection
  pooling, and significantly higher memory/CPU overhead for what is ultimately a
  transient, session-scoped cache. Game rooms expire within minutes; a relational
  store adds accidental complexity with no benefit.
- **In-memory-only rejected** for multi-replica scenarios because session affinity
  (sticky sessions) cannot guarantee 100% routing correctness across pods, and a
  pod restart would drop all active game rooms.

## Design Details

### CRD structure

```
GammaInstanceSpec
├── server               ServerSpec         (image, replicas, port, resources, env, secretEnvVars)
├── client               ClientSpec         (image, replicas, resources)
├── redis                RedisSpec          (enabled, image, resources, storage)
├── networking           NetworkingSpec     (ingress: className, host, tls, annotations)
├── autoscaling         *AutoscalingSpec    (enabled, minReplicas, maxReplicas, targetCPU)
└── observability        ObservabilitySpec  (enabled, otlpEndpoint, serviceName)
```

### Secret-sourced environment variables

The `server.secretEnvVars` field allows loading sensitive values (e.g., third-party
API keys for GIF services) from Kubernetes Secrets without embedding them in the
CR spec. Each entry specifies the environment variable name, the Secret name, and
the key within that Secret. The operator translates these into
`env[].valueFrom.secretKeyRef` entries on the server container.

### OTEL observability

The server emits OpenTelemetry traces and metrics over OTLP/HTTP. The
`observability` field in the CRD lets operators configure this without modifying
the server image:

- `enabled: true` with an `otlpEndpoint` pushes traces and metrics to a
  cluster-level OTEL Collector (e.g., OpenTelemetry Collector, Grafana Alloy).
- `enabled: false` disables telemetry entirely (useful for resource-constrained
  environments or when an OTEL pipeline is not available).
- When the field is omitted the server falls back to its built-in defaults
  (`OTEL_ENABLED=true`, pushing to `http://localhost:4318` — appropriate for
  development with a local collector sidecar).

## Consequences

- The operator must be installed (via the Helm chart) before any `GammaInstance`
  CR is created. This is a one-time cluster-level operation.
- Redis is deployed as a single-node StatefulSet. High-availability Redis (Redis
  Sentinel or Cluster) is out of scope for v1alpha1 but the `redis.image` field
  allows operators to substitute a HA Redis-compatible image.
- The CRD is in `v1alpha1`; breaking field changes require a version bump and
  migration plan before promoting to `v1beta1` or `v1`.
- The sticky-session timeout on the server Service (1 hour) means that a pod
  replacement during rolling updates may briefly break in-progress WebSocket
  connections for players whose pod is removed. The 15-second PreStop hook and
  60-second termination grace period mitigate this for most game rounds.
