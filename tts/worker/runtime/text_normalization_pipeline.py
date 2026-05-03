from __future__ import annotations

import re
from dataclasses import dataclass


_MULTISPACE = re.compile(r"\s+")
_NORMALIZATION_REQUIRED = re.compile(r"[\r\n\t\f\v]| {2,}")


@dataclass
class WeTextSnapshot:
    ready: bool = True
    error: str | None = None
    message: str = "ok"


class WeTextProcessingManager:
    def ensure_ready(self) -> WeTextSnapshot:
        return WeTextSnapshot()


def _normalize_text(value: str) -> str:
    normalized = _MULTISPACE.sub(" ", (value or "").replace("\r", " ").replace("\n", " ")).strip()
    return normalized


def is_lightweight_normalized_text(value: str) -> bool:
    candidate = value or ""
    if candidate != candidate.strip():
        return False
    return _NORMALIZATION_REQUIRED.search(candidate) is None


def prepare_tts_request_texts(
    *,
    text: str,
    prompt_text: str = "",
    voice: str = "",
    enable_wetext: bool = True,
    enable_normalize_tts_text: bool = True,
    text_normalizer_manager: WeTextProcessingManager | None = None,
) -> dict[str, object]:
    normalized_text = (
        text
        if enable_normalize_tts_text and is_lightweight_normalized_text(text)
        else _normalize_text(text) if enable_normalize_tts_text else (text or "").strip()
    )
    normalized_prompt = _normalize_text(prompt_text) if enable_normalize_tts_text else (prompt_text or "").strip()
    return {
        "text": normalized_text,
        "prompt_text": normalized_prompt,
        "voice": voice,
        "normalization_method": "lightweight_deterministic",
        "text_normalization_language": "en" if normalized_text else "",
        "wetext_enabled": enable_wetext,
        "wetext_ready": text_normalizer_manager.ensure_ready().ready if text_normalizer_manager else False,
    }
