from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PRIORITY_BLOCKER = "blocker"
PRIORITY_NEXT = "next"
PRIORITY_BACKGROUND = "background"
PRIORITY_ORDER = (PRIORITY_BLOCKER, PRIORITY_NEXT, PRIORITY_BACKGROUND)

STATUS_QUEUED = "queued"
STATUS_PROCESSING = "processing"
STATUS_READY = "ready"
STATUS_FAILED_RETRYABLE = "failed_retryable"
STATUS_FAILED_FINAL = "failed_final"
STATUS_EXPIRED = "expired"

CLAIMABLE_STATUSES = {STATUS_QUEUED, STATUS_FAILED_RETRYABLE}

_RFC3339_NANO_RE = re.compile(r"(?P<prefix>\.\d{6})\d+(?=(?:Z|[+-]\d{2}:\d{2})$)")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def format_timestamp(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_timestamp(value: Any) -> datetime | None:
    if value in {None, "", 0}:
        return None
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    text = str(value).strip()
    if not text:
        return None
    text = _RFC3339_NANO_RE.sub(r"\g<prefix>", text)
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    return datetime.fromisoformat(text).astimezone(timezone.utc)


def json_dumps(payload: dict[str, Any]) -> str:
    return json.dumps(payload, separators=(",", ":"), ensure_ascii=False)


@dataclass(slots=True)
class Job:
    id: str
    room_id: str
    round_id: str
    player_id: str
    locale: str
    voice_preset_id: str
    voice_engine_name: str
    voice_source: str
    text: str
    priority: str
    status: str
    artifact_key: str
    mime_type: str
    duration_ms: int
    estimated_speech_ms: int
    artifact_bytes: int
    content_hash: str
    model_version: str
    retry_count: int
    error: str
    lease_owner: str
    lease_expires_at: datetime | None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None
    completed_at: datetime | None
    expires_at: datetime

    @classmethod
    def from_json(cls, payload: str) -> Job:
        return cls.from_dict(json.loads(payload))

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> Job:
        return cls(
            id=str(payload.get("id", "")).strip(),
            room_id=str(payload.get("roomId", "")).strip(),
            round_id=str(payload.get("roundId", "")).strip(),
            player_id=str(payload.get("playerId", "")).strip(),
            locale=str(payload.get("locale", "")).strip(),
            voice_preset_id=str(payload.get("voicePresetId", "")).strip(),
            voice_engine_name=str(payload.get("voiceEngineName", "")).strip(),
            voice_source=str(payload.get("voiceSource", "")).strip(),
            text=str(payload.get("text", "")),
            priority=str(payload.get("priority", PRIORITY_BACKGROUND)).strip() or PRIORITY_BACKGROUND,
            status=str(payload.get("status", STATUS_QUEUED)).strip() or STATUS_QUEUED,
            artifact_key=str(payload.get("artifactKey", "")).strip(),
            mime_type=str(payload.get("mimeType", "")).strip(),
            duration_ms=int(payload.get("durationMs") or 0),
            estimated_speech_ms=int(payload.get("estimatedSpeechMs") or 0),
            artifact_bytes=int(payload.get("artifactBytes") or 0),
            content_hash=str(payload.get("contentHash", "")).strip(),
            model_version=str(payload.get("modelVersion", "")).strip(),
            retry_count=int(payload.get("retryCount") or 0),
            error=str(payload.get("error", "")).strip(),
            lease_owner=str(payload.get("leaseOwner", "")).strip(),
            lease_expires_at=parse_timestamp(payload.get("leaseExpiresAt")),
            created_at=parse_timestamp(payload.get("createdAt")) or utc_now(),
            updated_at=parse_timestamp(payload.get("updatedAt")) or utc_now(),
            started_at=parse_timestamp(payload.get("startedAt")),
            completed_at=parse_timestamp(payload.get("completedAt")),
            expires_at=parse_timestamp(payload.get("expiresAt")) or utc_now(),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "roomId": self.room_id,
            "roundId": self.round_id,
            "playerId": self.player_id,
            "locale": self.locale,
            "voicePresetId": self.voice_preset_id,
            "voiceEngineName": self.voice_engine_name or None,
            "voiceSource": self.voice_source or None,
            "text": self.text,
            "priority": self.priority,
            "status": self.status,
            "artifactKey": self.artifact_key or None,
            "mimeType": self.mime_type or None,
            "durationMs": self.duration_ms or None,
            "estimatedSpeechMs": self.estimated_speech_ms or None,
            "artifactBytes": self.artifact_bytes or None,
            "contentHash": self.content_hash or None,
            "modelVersion": self.model_version,
            "retryCount": self.retry_count,
            "error": self.error or None,
            "leaseOwner": self.lease_owner or None,
            "leaseExpiresAt": format_timestamp(self.lease_expires_at),
            "createdAt": format_timestamp(self.created_at),
            "updatedAt": format_timestamp(self.updated_at),
            "startedAt": format_timestamp(self.started_at),
            "completedAt": format_timestamp(self.completed_at),
            "expiresAt": format_timestamp(self.expires_at),
        }

    def to_json(self) -> str:
        payload = {key: value for key, value in self.to_dict().items() if value is not None}
        return json_dumps(payload)


@dataclass(slots=True)
class VoicePreset:
    id: str
    label: str
    tone: str
    source: str
    engine_voice_name: str
    pack_prompt_audio: str
    preview_path: str
    placeholder: bool
    available: bool
    availability_reason: str

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> VoicePreset:
        return cls(
            id=str(payload.get("id", "")).strip(),
            label=str(payload.get("label", "")).strip(),
            tone=str(payload.get("tone", "")).strip(),
            source=str(payload.get("source", "")).strip(),
            engine_voice_name=str(payload.get("engineVoiceName", "")).strip(),
            pack_prompt_audio=str(payload.get("packPromptAudio", "")).strip(),
            preview_path=str(payload.get("previewPath", "")).strip(),
            placeholder=bool(payload.get("placeholder", False)),
            available=bool(payload.get("available", False)),
            availability_reason=str(payload.get("availabilityReason", "")).strip(),
        )


@dataclass(slots=True)
class ResolvedVoice:
    source: str
    engine_voice_name: str = ""
    prompt_audio_path: Path | None = None
