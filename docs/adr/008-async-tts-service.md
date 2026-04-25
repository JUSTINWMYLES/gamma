# ADR-008: Async TTS Service for News Broadcast

**Date:** 2026-04
**Status:** Active

## Context

The `registry-45-news-broadcast` game requires synthetic speech to read player-authored headlines and scripts during the TV presentation phase. The TTS workload is bursty (all jobs arrive within a 3-minute creation window), CPU-intensive (neural inference), and latency-sensitive for the first few clips that block the reveal.

Key constraints:
- Must run on CPU-only nodes (no GPU requirement)
- Must not block the Colyseus event loop with synchronous inference
- Must not store audio in Redis or transmit base64 audio over WebSocket
- Must degrade gracefully to captions-only if TTS is unavailable
- Must support both single-node Docker Compose and multi-replica Kubernetes

Options considered for TTS backend:
1. **Synchronous in-process inference** — call ONNX runtime directly from the Colyseus server
2. **Async job queue with separate worker** — queue jobs in Redis, process in a dedicated worker
3. **External SaaS TTS API** — offload to a third-party service

Options considered for audio delivery:
1. **Base64 over Colyseus** — embed audio in room messages
2. **Direct client-to-worker fetch** — browser hits TTS worker directly
3. **Server proxy to object storage** — Gamma server proxies pre-signed or internal artifact URLs

## Decision

### Architecture: Async job queue with separate API + worker

Build two services:
- `tts-api` (Go/Gin) — validates requests, checks cache, creates jobs, returns status, exposes voice list
- `tts-worker` (Python) — loads ONNX model, synthesizes speech, encodes to MP3, uploads artifact

Jobs are queued in Redis using three priority lanes (`blocker`, `next`, `background`). The worker claims jobs with a lease TTL and heartbeats during processing. Failed jobs retry with exponential backoff.

### Audio delivery: Server proxy to MinIO object storage

Generated MP3 artifacts are stored in MinIO (S3-compatible). The Gamma server exposes `GET /api/tts/audio/:jobId`, which proxies the request to `tts-api` or serves from MinIO directly. Browsers never contact the TTS worker or MinIO directly.

### Model: MOSS-TTS-Nano-100M-ONNX

Use `OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX` in preset voice mode only. The ONNX CPU path is explicitly recommended by upstream for lightweight deployments and claims ~2x efficiency over the non-ONNX path.

## Rationale

### Why async job queue over in-process inference?

- **Non-blocking.** Colyseus must never wait on multi-second neural inference. An async queue keeps the event loop free.
- **Scalable.** Worker replicas can be added horizontally without changing the server code.
- **Resilient.** A crashed worker loses only its leased job; the lease expires and another worker picks it up.
- **Cacheable.** Content-addressed caching (text + voice + model version) avoids redundant inference.

### Why separate API and worker?

- **API is stateless and lightweight.** It can run with 1 replica and scale independently.
- **Worker is heavy.** It loads a ~100M parameter model into memory and should run one job at a time (concurrency = 1) for predictable latency.
- **Lifecycle decoupling.** API can be updated without restarting model-warm workers.

### Why MinIO over Redis or filesystem?

- **Redis rejected for audio storage.** Audio blobs are large, memory-inefficient, and increase eviction risk.
- **Filesystem rejected for Kubernetes.** Shared filesystems require NFS or hostPath, which add operational complexity. MinIO provides S3 semantics with a simple Deployment + PVC.
- **MinIO chosen.** It is self-contained, S3-compatible, and runs as a single Deployment with a PVC. For larger deployments, it can be swapped for AWS S3 without code changes.

### Why server proxy instead of direct client access?

- **Security.** Artifact URLs should not be exposed to browsers directly. The Gamma server can enforce room-scoped access and short-lived tokens if needed.
- **Simplicity.** The client already knows the Gamma server URL. No extra ingress rules or CORS configuration for MinIO.
- **Consistency.** All game data flows through the Colyseus server; audio is no exception.

### Why MOSS-TTS-Nano?

- **Size.** 0.1B parameters is small enough for CPU inference on modest nodes.
- **ONNX efficiency.** The ONNX runtime is optimized for CPU and avoids heavy PyTorch dependencies.
- **Preset voices.** Built-in voices provide predictable latency and quality without per-player custom cloning.
- **License.** Open-source and permissive for internal game use.

## Design Details

### Job lifecycle

| State | Meaning |
|---|---|
| `queued` | Waiting in a scheduling lane |
| `leased` | Claimed by a worker |
| `processing` | Inference is active |
| `postprocessing` | Audio encoding and storage write |
| `ready` | Artifact available |
| `failed_retryable` | Will retry |
| `failed_final` | Retries exhausted |

### Queue lanes

| Lane | Purpose |
|---|---|
| `blocker` | Must be ready for next reveal |
| `next` | Likely needed soon |
| `background` | Not immediately reveal-blocking |

Per-room cap: max 2 high-priority jobs at once to prevent starvation.

### Prebuffer rule

The game enters a `buffering` phase after creation ends. It waits until the first 2 presentation clips are `ready`, or until a 12s timeout. This is the single most important smoothness control.

### Artifact lifetime

Artifacts expire 2 hours after room completion. Explicit deletion is triggered on room teardown. A background cleanup loop handles any missed artifacts.

### Deployment primitives

- `Deployment` for `tts-api`
- `Deployment` for `tts-worker`
- `Deployment` for `minio`
- `PersistentVolumeClaim` for MinIO data

All managed by the Gamma operator when `spec.tts.enabled: true`.

## Consequences

- TTS requires Redis (`spec.redis.enabled: true`). The operator enforces this dependency.
- The first worker cold-start may take 10-30s for model warmup. The worker reports readiness only after warmup.
- Worker memory footprint is 4-6 GiB per replica. Production deployments should size nodes accordingly.
- The Gamma server must poll job status or receive notifications. The current implementation polls `tts-api` every few seconds.
- If TTS is completely unavailable (no `TTS_API_URL` env var), the game degrades to captions-only presentation.
- The CRD gains a `tts` stanza with `api`, `worker`, `minio`, and `config` sub-fields. This increases CRD surface but keeps TTS configuration declarative.

## Related Documents

- `docs/registry-45-news-broadcast-design.md` — full game design including TTS integration
- `docs/registry/registry-45-news-broadcast.md` — registry entry
- `server/src/games/registry-45-news-broadcast/` — game plugin implementation
- `tts/api-go/` — Go TTS API source
- `tts/worker/` — Python TTS worker source
