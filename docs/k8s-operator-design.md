# Kubernetes Operator Design

## Overview

The Gamma operator manages the lifecycle of Gamma game servers on Kubernetes using a **hub-and-spoke** model. A single operator deployment (the hub) watches custom resources and creates, scales, and tears down per-game-session Colyseus server instances (the spokes).

---

## Custom Resource Definitions

Four CRDs are defined in `k8s/crds/`:

| CRD | Kind | Purpose |
|-----|------|---------|
| `gamma-cluster.yaml` | `GammaCluster` | Cluster-wide configuration (image, resource defaults, admission domains) |
| `gamma-game-deployment.yaml` | `GammaGameDeployment` | A named, versioned game plugin deployment (one per registered game) |
| `gamma-operator-policy.yaml` | `GammaOperatorPolicy` | Rate limits, max rooms per node, GeoIP rules |
| `gamma-hub-request.yaml` | `GammaHubRequest` | On-demand request for a new game session room |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│  Kubernetes Cluster                          │
│                                              │
│  ┌────────────────────┐                      │
│  │  Gamma Operator    │  watches CRDs        │
│  │  (hub)             │◄─────────────────────┤
│  └────────┬───────────┘                      │
│           │ creates/manages                  │
│           ▼                                  │
│  ┌─────────────────┐  ┌─────────────────┐    │
│  │  GammaRoom Pod  │  │  GammaRoom Pod  │    │
│  │  (spoke)        │  │  (spoke)        │    │
│  │  registry-14    │  │  registry-07    │    │
│  └─────────────────┘  └─────────────────┘    │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Ingress / LoadBalancer                │  │
│  │  routes /rooms/<code> to correct pod   │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## Operator Reconciliation Loop

The operator implements a standard controller-manager reconcile loop:

1. **GammaCluster** reconciled → operator reads global config (image tag, resource quotas, domain allowlist).
2. **GammaGameDeployment** reconciled → operator ensures a `Deployment` and `Service` exist for that game plugin version. Updates the image if the spec changes.
3. **GammaHubRequest** reconciled → operator creates a single-room Pod (or selects an existing underloaded room server), then writes the assigned `roomCode` and `endpoint` back into the resource's `.status` field.
4. **GammaOperatorPolicy** reconciled → operator enforces rate limits at the admission webhook level and sets `ResourceQuota` objects on namespaces.

Finalizers are set on all spoke resources so the operator can clean up gracefully when a `GammaHubRequest` is deleted (e.g. session ended, TTL expired).

---

## GammaHubRequest Lifecycle

```
Pending → Scheduling → Ready → Active → Terminating → Deleted
```

| Phase | Operator action |
|-------|----------------|
| `Pending` | Resource created; operator queues it |
| `Scheduling` | Operator selects a target node/pod, assigns `roomCode` |
| `Ready` | Room server is up and accepting connections; `.status.endpoint` populated |
| `Active` | At least one player has connected |
| `Terminating` | All players have disconnected or TTL exceeded; operator scales down pod |

A room that stays in `Pending` for more than `spec.timeoutSecs` (default 60 s) is automatically moved to `Terminating`.

---

## Room Server Pod Spec

Each spoke Pod is a single-container instance of the Gamma server image:

```yaml
containers:
  - name: gamma-room
    image: ghcr.io/gamma/server:<tag>
    env:
      - name: ROOM_CODE
        valueFrom:
          fieldRef: { fieldPath: metadata.annotations['gamma.io/room-code'] }
      - name: GAME_ID
        value: registry-14-dont-get-caught
    ports:
      - containerPort: 2567
    resources:
      requests: { cpu: 100m, memory: 128Mi }
      limits:   { cpu: 500m, memory: 256Mi }
    readinessProbe:
      httpGet: { path: /healthz, port: 2567 }
      initialDelaySeconds: 2
      periodSeconds: 5
```

The room code is injected via a pod annotation and read by the server at start-up to register the Colyseus room under the correct code.

---

## Helm Chart

The Helm chart in `helm/gamma-operator/` deploys the operator itself (not the spoke Pods — those are created dynamically).

Key values (`helm/gamma-operator/values.yaml`):

| Key | Default | Description |
|-----|---------|-------------|
| `image.repository` | `ghcr.io/gamma/operator` | Operator image |
| `image.tag` | `latest` | Image tag |
| `replicaCount` | `1` | Operator replicas (use 1; leader election not yet implemented) |
| `serviceAccount.create` | `true` | Create a dedicated service account |
| `rbac.create` | `true` | Create ClusterRole + binding |
| `resources.limits.cpu` | `500m` | CPU limit for the operator pod |

Install:

```bash
helm install gamma-operator helm/gamma-operator \
  --namespace gamma-system \
  --create-namespace \
  -f my-values.yaml
```

---

## RBAC

The ClusterRole defined in `k8s/rbac.yaml` grants the operator:

- `get`, `list`, `watch`, `create`, `update`, `patch`, `delete` on the four Gamma CRDs.
- `get`, `list`, `watch`, `create`, `update`, `patch`, `delete` on `Pods`, `Deployments`, `Services` in the `gamma-rooms` namespace.
- `get`, `list`, `watch` on `Nodes` (for scheduling decisions).

The operator service account is bound to this role via a `ClusterRoleBinding`.

---

## Scaling Considerations

- **Horizontal scaling**: The operator itself is stateless (all state is in Kubernetes resources). Running two replicas with leader election is a future improvement.
- **Spoke density**: The `GammaOperatorPolicy` `maxRoomsPerNode` field limits how many room Pods the operator will schedule on a single node, preventing one noisy-neighbour room from starving others.
- **Idle rooms**: Rooms with no connected players for `policy.idleTimeoutSecs` (default 300 s) are automatically reaped by the operator.
- **Game server image updates**: Updating `GammaGameDeployment.spec.image` triggers a rolling update of the corresponding deployment; in-flight rooms continue on the old image until they close naturally.

---

## Future Work

- Leader election for multi-replica operator deployment.
- Admission webhook to validate `GammaHubRequest` against `GammaOperatorPolicy` at creation time.
- Horizontal Pod Autoscaler on room deployments keyed on custom metrics (active connections).
- Cross-region hub federation via `GammaCluster` federation spec.
