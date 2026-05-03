from __future__ import annotations

import json
from pathlib import Path

try:  # pragma: no cover - import path compatibility
    from .errors import FatalJobError
    from .models import Job, ResolvedVoice, VoicePreset
except ImportError:  # pragma: no cover - direct script execution
    from errors import FatalJobError
    from models import Job, ResolvedVoice, VoicePreset


class VoiceRegistry:
    def __init__(self, manifest_path: Path) -> None:
        self.manifest_path = manifest_path.expanduser().resolve()
        self.manifest_dir = self.manifest_path.parent
        self._voices: dict[str, VoicePreset] = {}
        self._manifest_mtime_ns = 0
        self._manifest_size = -1
        self.refresh()

    def refresh(self) -> None:
        stat = self.manifest_path.stat()
        payload = json.loads(self.manifest_path.read_text(encoding="utf-8"))
        voices: dict[str, VoicePreset] = {}
        for raw_voice in payload.get("voices", []):
            voice = VoicePreset.from_dict(raw_voice)
            available = False
            reason = ""
            placeholder = voice.placeholder
            if voice.source == "builtin":
                available = bool(voice.engine_voice_name)
                if not available:
                    reason = "missing builtin engine voice mapping"
            elif voice.source == "voice_pack":
                if not voice.pack_prompt_audio:
                    reason = "missing packaged prompt audio path"
                else:
                    prompt_audio_path = (self.manifest_dir / voice.pack_prompt_audio).resolve()
                    if prompt_audio_path.is_file():
                        available = True
                        placeholder = False
                    else:
                        reason = "packaged prompt audio not found"
            else:
                reason = "unknown voice source"

            voices[voice.id] = VoicePreset(
                id=voice.id,
                label=voice.label,
                tone=voice.tone,
                source=voice.source,
                engine_voice_name=voice.engine_voice_name,
                pack_prompt_audio=voice.pack_prompt_audio,
                preview_path=voice.preview_path,
                placeholder=placeholder,
                available=available,
                availability_reason=reason,
            )
        self._voices = voices
        self._manifest_mtime_ns = getattr(stat, "st_mtime_ns", int(stat.st_mtime * 1_000_000_000))
        self._manifest_size = stat.st_size

    def refresh_if_changed(self) -> None:
        stat = self.manifest_path.stat()
        mtime_ns = getattr(stat, "st_mtime_ns", int(stat.st_mtime * 1_000_000_000))
        if mtime_ns == self._manifest_mtime_ns and stat.st_size == self._manifest_size and self._voices:
            return
        self.refresh()

    def resolve_for_job(self, job: Job) -> ResolvedVoice:
        self.refresh_if_changed()
        preset = self._voices.get(job.voice_preset_id)
        source = (job.voice_source or (preset.source if preset else "")).strip()
        if source == "builtin":
            engine_voice_name = (job.voice_engine_name or (preset.engine_voice_name if preset else "")).strip()
            if not engine_voice_name:
                raise FatalJobError(f"voice preset {job.voice_preset_id!r} is missing builtin engineVoiceName")
            return ResolvedVoice(source="builtin", engine_voice_name=engine_voice_name)

        if source == "voice_pack":
            if preset is None:
                raise FatalJobError(f"voice preset {job.voice_preset_id!r} was not found in the voice manifest")
            if not preset.pack_prompt_audio:
                raise FatalJobError(f"voice preset {job.voice_preset_id!r} is missing packPromptAudio")
            prompt_audio_path = (self.manifest_dir / preset.pack_prompt_audio).resolve()
            if not prompt_audio_path.is_file():
                raise FatalJobError(
                    f"voice preset {job.voice_preset_id!r} prompt audio not found: {prompt_audio_path}"
                )
            return ResolvedVoice(source="voice_pack", prompt_audio_path=prompt_audio_path)

        if preset is not None and preset.source == "builtin" and preset.engine_voice_name:
            return ResolvedVoice(source="builtin", engine_voice_name=preset.engine_voice_name)

        raise FatalJobError(
            f"voice preset {job.voice_preset_id!r} cannot be resolved for source {source or '<empty>'}"
        )
