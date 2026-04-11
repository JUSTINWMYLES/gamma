# Kubernetes Client Runtime Config

## Summary

The public Gamma client must receive a browser-reachable Colyseus base URL at deployment time. This must not be baked into the `gamma-client` image.

The client image in this repo now supports runtime injection via:

```text
GAMMA_SERVER_URL
```

which is rendered into `/config.js` at container startup.

## Current runtime design

- `client/app/index.html` loads `/config.js` before the SPA entrypoint
- `client/shared/colyseusClient.ts` reads `window.__GAMMA_CONFIG__.serverUrl` first
- if no runtime URL is provided, the client derives the URL from `window.location`
- local Vite dev still auto-derives `:2567`

## Operator behavior

The operator now sets the client runtime server URL in this order:

1. `spec.client.serverUrl`
2. derived from ingress host as `ws://<host>/ws` or `wss://<host>/ws` when ingress is enabled
3. omitted entirely, letting the client derive from browser location

## Deployment repo requirements

The deployment repo still needs to ensure that Colyseus traffic is routed correctly.

Colyseus requires both:
- HTTP matchmaking under `/matchmake/...`
- WebSocket room traffic after matchmaking

If you keep a `/ws` prefix for the server, ingress must route the full Colyseus surface area consistently for that prefix.

For example, a working public base URL could be:

```text
wss://gammagames.xyz/ws
```

But the ingress must then correctly forward at least:
- `/ws/matchmake/...`
- `/ws/<processId>/<roomId>?sessionId=...`

If path-prefix routing becomes awkward, use a dedicated real-time hostname instead.

Example:
- `https://gammagames.xyz/` for the SPA
- `wss://rt.gammagames.xyz/` for Colyseus

## Custom Resource usage

You may now set this explicitly on a `GammaInstance`:

```yaml
spec:
  client:
    image: ghcr.io/justinwmyles/gamma-client:<tag>
    serverUrl: wss://gammagames.xyz/ws
```

If omitted and ingress is enabled with a host, the operator derives it automatically.
