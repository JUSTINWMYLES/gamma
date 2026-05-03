"""HTTP health endpoint for the TTS worker.

Provides a /healthz endpoint that Kubernetes can probe instead of
executing inline Python one-liners (H5 fix).
"""
from __future__ import annotations

import json
import logging
import os
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler

LOGGER = logging.getLogger("gamma.tts.worker.health")


class HealthHandler(BaseHTTPRequestHandler):
    def __init__(
        self,
        *args,
        redis_store,
        health_file,
        **kwargs,
    ):
        self._redis_store = redis_store
        self._health_file = health_file
        super().__init__(*args, **kwargs)

    def do_GET(self):
        if self.path == "/healthz":
            healthy = True
            details: dict[str, str] = {}

            # Check health file
            if os.path.exists(self._health_file):
                details["health_file"] = "ok"
            else:
                details["health_file"] = "missing"
                healthy = False

            # Check Redis
            try:
                self._redis_store.ping()
                details["redis"] = "ok"
            except Exception as exc:
                details["redis"] = f"error: {exc}"
                healthy = False

            status = 200 if healthy else 503
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok" if healthy else "unhealthy", "checks": details}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        LOGGER.debug(format, *args)


class HealthServer:
    """Background HTTP server for Kubernetes readiness/liveness probes."""

    def __init__(self, port: int, redis_store, health_file: str):
        self._port = port
        self._redis_store = redis_store
        self._health_file = health_file
        self._server: HTTPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        handler = lambda *a, **kw: HealthHandler(
            *a,
            redis_store=self._redis_store,
            health_file=self._health_file,
            **kw,
        )
        self._server = HTTPServer(("0.0.0.0", self._port), handler)
        self._thread = threading.Thread(target=self._server.serve_forever, name="tts-health", daemon=True)
        self._thread.start()
        LOGGER.info("health server started port=%d", self._port)

    def stop(self) -> None:
        if self._server:
            self._server.shutdown()
