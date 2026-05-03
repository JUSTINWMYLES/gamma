from __future__ import annotations

import os
import re
import socket
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path


_DURATION_RE = re.compile(r"^\s*(?P<value>\d+(?:\.\d+)?)(?P<unit>ms|s|m|h)?\s*$")

_WORKER_DIR = Path(__file__).resolve().parent
_TTS_DIR = _WORKER_DIR.parent


@dataclass(frozen=True, slots=True)
class WorkerConfig:
    worker_id: str
    redis_url: str
    redis_key_prefix: str
    minio_endpoint: str
    minio_use_ssl: bool
    minio_access_key: str
    minio_secret_key: str
    minio_bucket_name: str
    voice_manifest_path: Path
    model_dir: Path
    model_version: str
    max_retries: int
    heartbeat_interval: timedelta
    heartbeat_ttl: timedelta
    lease_duration: timedelta
    poll_interval: timedelta
    queue_claim_batch_size: int
    retry_backoff_base: timedelta
    retry_backoff_max: timedelta
    cpu_threads: int
    ort_inter_op_threads: int
    sample_mode: str
    do_sample: bool
    voice_clone_max_text_tokens: int
    max_new_frames: int
    enable_wetext_processing: bool
    enable_normalize_tts_text: bool
    mp3_bitrate_kbps: int
    warmup_enabled: bool
    random_seed: int | None
    log_level: str
    health_file: Path
    health_server_port: int


def load_config() -> WorkerConfig:
    cpu_count = os.cpu_count() or 1
    cpu_default = max(1, min(4, cpu_count))
    ort_inter_op_default = 1 if cpu_count <= 2 else 2
    heartbeat_interval = env_duration("TTS_WORKER_HEARTBEAT_INTERVAL", timedelta(seconds=10))
    heartbeat_max_age = env_duration("TTS_WORKER_HEARTBEAT_MAX_AGE", timedelta(seconds=45))
    heartbeat_ttl = env_duration(
        "TTS_WORKER_HEARTBEAT_TTL",
        max(heartbeat_interval * 3, heartbeat_max_age),
    )

    return WorkerConfig(
        worker_id=env_string("TTS_WORKER_ID", f"{socket.gethostname()}-{os.getpid()}"),
        redis_url=env_string("REDIS_URL", "redis://localhost:6379/0"),
        redis_key_prefix=env_string("TTS_REDIS_KEY_PREFIX", "gamma:tts"),
        minio_endpoint=env_string("MINIO_ENDPOINT", "localhost:9000"),
        minio_use_ssl=env_bool("MINIO_USE_SSL", False),
        minio_access_key=env_string("MINIO_ACCESS_KEY", "gamma"),
        minio_secret_key=env_string("MINIO_SECRET_KEY", "gammalocal"),
        minio_bucket_name=env_string("MINIO_BUCKET_NAME", "gamma-tts-artifacts"),
        voice_manifest_path=env_path(
            "TTS_VOICE_MANIFEST_PATH",
            _TTS_DIR / "voices" / "manifest.json",
        ),
        model_dir=env_path("TTS_MODEL_DIR", _WORKER_DIR / "models"),
        model_version=env_string("TTS_MODEL_VERSION", "OpenMOSS-Team/MOSS-TTS-Nano-100M-ONNX"),
        max_retries=env_int("TTS_MAX_RETRIES", 3),
        heartbeat_interval=heartbeat_interval,
        heartbeat_ttl=heartbeat_ttl,
        lease_duration=env_duration("TTS_WORKER_LEASE_DURATION", timedelta(seconds=90)),
        poll_interval=env_duration("TTS_WORKER_POLL_INTERVAL", timedelta(milliseconds=250)),
        queue_claim_batch_size=env_int("TTS_WORKER_QUEUE_CLAIM_BATCH_SIZE", 10),
        retry_backoff_base=env_duration("TTS_WORKER_RETRY_BACKOFF_BASE", timedelta(seconds=2)),
        retry_backoff_max=env_duration("TTS_WORKER_RETRY_BACKOFF_MAX", timedelta(seconds=30)),
        cpu_threads=max(1, env_int("TTS_CPU_THREADS", cpu_default)),
        ort_inter_op_threads=max(1, env_int("TTS_ORT_INTER_OP_THREADS", ort_inter_op_default)),
        sample_mode=env_string("TTS_SAMPLE_MODE", "fixed"),
        do_sample=env_bool("TTS_DO_SAMPLE", True),
        voice_clone_max_text_tokens=max(1, env_int("TTS_VOICE_CLONE_MAX_TEXT_TOKENS", 75)),
        max_new_frames=max(1, env_int("TTS_MAX_NEW_FRAMES", 375)),
        enable_wetext_processing=env_bool("TTS_ENABLE_WETEXT_PROCESSING", True),
        enable_normalize_tts_text=env_bool("TTS_ENABLE_NORMALIZE_TTS_TEXT", True),
        mp3_bitrate_kbps=max(32, env_int("TTS_MP3_BITRATE_KBPS", 128)),
        warmup_enabled=env_bool("TTS_WARMUP_ENABLED", True),
        random_seed=env_optional_int("TTS_RANDOM_SEED"),
        log_level=env_string("TTS_LOG_LEVEL", "INFO"),
        health_file=env_path("TTS_WORKER_HEALTH_FILE", Path("/tmp/gamma-tts-worker-health")),
        health_server_port=env_int("TTS_WORKER_HEALTH_PORT", 8091),
    )


def env_string(name: str, fallback: str) -> str:
    value = os.getenv(name, "").strip()
    return value or fallback


def env_bool(name: str, fallback: bool) -> bool:
    value = os.getenv(name, "").strip().lower()
    if not value:
        return fallback
    if value in {"1", "true", "yes", "on"}:
        return True
    if value in {"0", "false", "no", "off"}:
        return False
    return fallback


def env_int(name: str, fallback: int) -> int:
    value = os.getenv(name, "").strip()
    if not value:
        return fallback
    try:
        return int(value)
    except ValueError:
        return fallback


def env_optional_int(name: str) -> int | None:
    value = os.getenv(name, "").strip()
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        return None


def env_duration(name: str, fallback: timedelta) -> timedelta:
    value = os.getenv(name, "").strip()
    if not value:
        return fallback
    match = _DURATION_RE.match(value)
    if not match:
        return fallback
    amount = float(match.group("value"))
    unit = match.group("unit") or "s"
    if unit == "ms":
        seconds = amount / 1000.0
    elif unit == "m":
        seconds = amount * 60.0
    elif unit == "h":
        seconds = amount * 3600.0
    else:
        seconds = amount
    return timedelta(seconds=seconds)


def env_path(name: str, fallback: Path) -> Path:
    value = os.getenv(name, "").strip()
    raw_path = Path(value).expanduser() if value else fallback.expanduser()
    return raw_path.resolve()
