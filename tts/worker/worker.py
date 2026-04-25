from __future__ import annotations

import logging
import signal
import threading
import traceback
from dataclasses import dataclass
from datetime import timedelta

try:  # pragma: no cover - import path compatibility
    from .audio import encode_mp3, waveform_duration_ms
    from .errors import FatalJobError, RetryableJobError
    from .models import (
        Job,
        PRIORITY_ORDER,
        STATUS_FAILED_FINAL,
        STATUS_FAILED_RETRYABLE,
        utc_now,
    )
    from .object_store import ObjectStore
    from .redis_store import RedisStore
    from .runtime import MossSynthesisResult, MossTTSNanoRuntime
    from .settings import WorkerConfig, load_config
    from .voices import VoiceRegistry
except ImportError:  # pragma: no cover - direct script execution
    from audio import encode_mp3, waveform_duration_ms
    from errors import FatalJobError, RetryableJobError
    from models import (
        Job,
        PRIORITY_ORDER,
        STATUS_FAILED_FINAL,
        STATUS_FAILED_RETRYABLE,
        utc_now,
    )
    from object_store import ObjectStore
    from redis_store import RedisStore
    from runtime import MossSynthesisResult, MossTTSNanoRuntime
    from settings import WorkerConfig, load_config
    from voices import VoiceRegistry


LOGGER = logging.getLogger("gamma.tts.worker")


@dataclass(slots=True)
class CurrentLease:
    job_id: str | None = None
    lease_lost: bool = False


class LeaseState:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._current = CurrentLease()

    def set(self, job_id: str) -> None:
        with self._lock:
            self._current = CurrentLease(job_id=job_id, lease_lost=False)

    def clear(self, job_id: str | None = None) -> None:
        with self._lock:
            if job_id is not None and self._current.job_id != job_id:
                return
            self._current = CurrentLease()

    def snapshot(self) -> CurrentLease:
        with self._lock:
            return CurrentLease(job_id=self._current.job_id, lease_lost=self._current.lease_lost)

    def mark_lost(self, job_id: str) -> None:
        with self._lock:
            if self._current.job_id == job_id:
                self._current.lease_lost = True

    def is_lost(self, job_id: str) -> bool:
        with self._lock:
            return self._current.job_id == job_id and self._current.lease_lost


class WorkerService:
    def __init__(self, config: WorkerConfig) -> None:
        self.config = config
        self.stop_event = threading.Event()
        self.lease_state = LeaseState()

        self.store = RedisStore(config)
        self.object_store = ObjectStore(config)
        self.voice_registry = VoiceRegistry(config.voice_manifest_path)
        self.runtime = MossTTSNanoRuntime(
            model_dir=config.model_dir,
            thread_count=config.cpu_threads,
            max_new_frames=config.max_new_frames,
            do_sample=config.do_sample,
            sample_mode=config.sample_mode,
        )
        self._builtin_voice_names = {
            str(item.get("voice", "")).strip()
            for item in self.runtime.list_builtin_voices()
            if str(item.get("voice", "")).strip()
        }

    def start(self) -> None:
        self._touch_health_file()
        self.store.ping()
        self.object_store.ensure_bucket()
        self.voice_registry.refresh()
        if self.config.warmup_enabled:
            LOGGER.info("warming up MOSS-TTS-Nano runtime")
            self.runtime.warmup()
        self.store.write_heartbeat(self.config.worker_id, self.config.heartbeat_ttl)
        self._touch_health_file()
        threading.Thread(target=self._heartbeat_loop, name="tts-heartbeat", daemon=True).start()
        LOGGER.info(
            "worker ready worker_id=%s model_dir=%s cpu_threads=%s sample_mode=%s do_sample=%s",
            self.config.worker_id,
            self.config.model_dir,
            self.config.cpu_threads,
            self.config.sample_mode,
            self.config.do_sample,
        )

    def run(self) -> None:
        self.start()
        while not self.stop_event.is_set():
            try:
                job = self._claim_next_job()
                if job is None:
                    self.stop_event.wait(self.config.poll_interval.total_seconds())
                    continue
                self._process_job(job)
                self.stop_event.wait(self.config.busy_poll_interval.total_seconds())
            except Exception:
                LOGGER.exception("worker loop iteration failed")
                self.stop_event.wait(self.config.poll_interval.total_seconds())

    def shutdown(self) -> None:
        self.stop_event.set()

    def _heartbeat_loop(self) -> None:
        while not self.stop_event.is_set():
            try:
                self.store.write_heartbeat(self.config.worker_id, self.config.heartbeat_ttl)
                self._touch_health_file()
                current = self.lease_state.snapshot()
                if current.job_id:
                    renewed = self.store.renew_lease(
                        current.job_id,
                        worker_id=self.config.worker_id,
                        lease_duration=self.config.lease_duration,
                    )
                    if not renewed:
                        LOGGER.warning("lease renewal failed for job %s", current.job_id)
                        self.lease_state.mark_lost(current.job_id)
            except Exception:
                LOGGER.exception("heartbeat loop failed")
            self.stop_event.wait(self.config.heartbeat_interval.total_seconds())

    def _touch_health_file(self) -> None:
        try:
            self.config.health_file.parent.mkdir(parents=True, exist_ok=True)
            self.config.health_file.touch(exist_ok=True)
        except Exception:
            LOGGER.exception("failed to update worker health file path=%s", self.config.health_file)

    def _claim_next_job(self) -> Job | None:
        for priority in PRIORITY_ORDER:
            job = self.store.claim_next_job(
                priority,
                worker_id=self.config.worker_id,
                lease_duration=self.config.lease_duration,
                batch_size=self.config.queue_claim_batch_size,
            )
            if job is not None:
                LOGGER.info(
                    "claimed job id=%s priority=%s voicePresetId=%s retryCount=%s",
                    job.id,
                    job.priority,
                    job.voice_preset_id,
                    job.retry_count,
                )
                return job
        return None

    def _process_job(self, job: Job) -> None:
        self.lease_state.set(job.id)
        try:
            result = self._synthesize_job(job)
            if self.lease_state.is_lost(job.id):
                raise RetryableJobError("job lease was lost before artifact upload")

            mime_type = job.mime_type or "audio/mpeg"
            if not job.artifact_key:
                raise FatalJobError("job artifactKey is missing")

            mp3_bytes = encode_mp3(
                result.waveform,
                result.sample_rate,
                bitrate_kbps=self.config.mp3_bitrate_kbps,
            )

            if self.lease_state.is_lost(job.id):
                raise RetryableJobError("job lease was lost after synthesis completed")

            artifact_bytes = self.object_store.put_bytes(
                job.artifact_key,
                mp3_bytes,
                content_type=mime_type,
                metadata={
                    "job-id": job.id,
                    "room-id": job.room_id,
                    "round-id": job.round_id,
                    "player-id": job.player_id,
                    "voice-preset-id": job.voice_preset_id,
                    "model-version": job.model_version or self.config.model_version,
                },
            )
            duration_ms = waveform_duration_ms(result.waveform, result.sample_rate)
            updated_job = self.store.mark_ready(
                job.id,
                worker_id=self.config.worker_id,
                artifact_bytes=artifact_bytes,
                duration_ms=duration_ms,
                mime_type=mime_type,
                model_version=job.model_version or self.config.model_version,
            )
            if updated_job is None:
                LOGGER.warning("job %s finished but lease ownership was lost before ready update", job.id)
                return
            LOGGER.info(
                "job ready id=%s durationMs=%s artifactBytes=%s chunks=%s",
                job.id,
                updated_job.duration_ms,
                updated_job.artifact_bytes,
                len(result.text_chunks),
            )
        except FatalJobError as exc:
            self._fail_job(job, str(exc), retryable=False)
        except RetryableJobError as exc:
            self._fail_job(job, str(exc), retryable=True)
        except Exception as exc:  # pragma: no cover - defensive fallback
            LOGGER.error("unexpected synthesis failure for job %s: %s", job.id, exc)
            LOGGER.debug("stack trace for job %s\n%s", job.id, traceback.format_exc())
            self._fail_job(job, str(exc) or exc.__class__.__name__, retryable=True)
        finally:
            self.lease_state.clear(job.id)

    def _synthesize_job(self, job: Job) -> MossSynthesisResult:
        resolved_voice = self.voice_registry.resolve_for_job(job)
        if resolved_voice.source == "builtin" and resolved_voice.engine_voice_name not in self._builtin_voice_names:
            raise FatalJobError(
                f"builtin engine voice {resolved_voice.engine_voice_name!r} is not present in the MOSS runtime manifest"
            )
        LOGGER.info(
            "starting synthesis id=%s source=%s voice=%s locale=%s textChars=%s",
            job.id,
            resolved_voice.source,
            resolved_voice.engine_voice_name or (str(resolved_voice.prompt_audio_path) if resolved_voice.prompt_audio_path else ""),
            job.locale,
            len(job.text),
        )
        return self.runtime.synthesize(
            text=job.text,
            voice=resolved_voice.engine_voice_name or None,
            prompt_audio_path=resolved_voice.prompt_audio_path,
            sample_mode=self.config.sample_mode,
            do_sample=self.config.do_sample,
            streaming=False,
            max_new_frames=self.config.max_new_frames,
            voice_clone_max_text_tokens=self.config.voice_clone_max_text_tokens,
            enable_wetext=self.config.enable_wetext_processing,
            enable_normalize_tts_text=self.config.enable_normalize_tts_text,
            seed=self.config.random_seed,
        )

    def _fail_job(self, job: Job, error: str, *, retryable: bool) -> None:
        message = self._normalize_error_message(error)
        if not retryable:
            updated = self.store.mark_failure(
                job.id,
                worker_id=self.config.worker_id,
                status=STATUS_FAILED_FINAL,
                error=message,
                retry_count=job.retry_count,
                priority=job.priority,
                run_at=None,
            )
            if updated is None:
                LOGGER.warning("job %s failed fatally but lease ownership was already lost", job.id)
                return
            LOGGER.warning("job failed_final id=%s error=%s", job.id, message)
            return

        next_retry_count = job.retry_count + 1
        if next_retry_count > self.config.max_retries:
            updated = self.store.mark_failure(
                job.id,
                worker_id=self.config.worker_id,
                status=STATUS_FAILED_FINAL,
                error=message,
                retry_count=next_retry_count,
                priority=job.priority,
                run_at=None,
            )
            if updated is None:
                LOGGER.warning("job %s exhausted retries but lease ownership was already lost", job.id)
                return
            LOGGER.warning("job failed_final after retries id=%s retryCount=%s error=%s", job.id, next_retry_count, message)
            return

        run_at = self._retry_run_at(next_retry_count)
        updated = self.store.mark_failure(
            job.id,
            worker_id=self.config.worker_id,
            status=STATUS_FAILED_RETRYABLE,
            error=message,
            retry_count=next_retry_count,
            priority=job.priority,
            run_at=run_at,
        )
        if updated is None:
            LOGGER.warning("job %s retry update skipped because lease ownership was already lost", job.id)
            return
        LOGGER.warning(
            "job failed_retryable id=%s retryCount=%s nextAttemptAt=%s error=%s",
            job.id,
            next_retry_count,
            run_at.isoformat(),
            message,
        )

    def _retry_run_at(self, retry_count: int):
        base_seconds = self.config.retry_backoff_base.total_seconds()
        max_seconds = self.config.retry_backoff_max.total_seconds()
        delay_seconds = min(max_seconds, base_seconds * (2 ** max(0, retry_count - 1)))
        return utc_now() + timedelta(seconds=delay_seconds)

    @staticmethod
    def _normalize_error_message(error: str) -> str:
        message = " ".join(str(error or "worker failure").split())
        if len(message) > 400:
            return f"{message[:397]}..."
        return message


def configure_logging(level: str) -> None:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )


def install_signal_handlers(service: WorkerService) -> None:
    def _handle_signal(signum: int, _frame: object) -> None:
        LOGGER.info("received signal %s, shutting down", signum)
        service.shutdown()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)


def main() -> int:
    config = load_config()
    configure_logging(config.log_level)
    service = WorkerService(config)
    install_signal_handlers(service)
    try:
        service.run()
    except KeyboardInterrupt:
        service.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
