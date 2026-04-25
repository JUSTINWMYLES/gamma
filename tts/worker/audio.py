from __future__ import annotations

import shutil
import subprocess
import numpy as np

try:
    import lameenc
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    lameenc = None


def waveform_duration_ms(waveform: np.ndarray, sample_rate: int) -> int:
    if sample_rate <= 0:
        return 0
    total_samples = int(np.asarray(waveform).shape[0]) if np.asarray(waveform).ndim >= 1 else 0
    return int(round((total_samples / float(sample_rate)) * 1000.0))


def encode_mp3(waveform: np.ndarray, sample_rate: int, bitrate_kbps: int) -> bytes:
    audio = np.asarray(waveform, dtype=np.float32)
    if audio.ndim == 1:
        audio = audio.reshape(-1, 1)
    if audio.ndim != 2 or audio.shape[0] == 0 or audio.shape[1] == 0:
        raise ValueError("cannot encode an empty waveform to MP3")

    clipped = np.clip(audio, -1.0, 1.0)
    pcm16 = np.round(clipped * 32767.0).astype(np.int16, copy=False)

    if lameenc is not None:
        encoder = lameenc.Encoder()
        encoder.set_bit_rate(max(32, int(bitrate_kbps)))
        encoder.set_in_sample_rate(int(sample_rate))
        encoder.set_channels(int(pcm16.shape[1]))
        encoder.set_quality(2)

        payload = encoder.encode(pcm16.tobytes())
        payload += encoder.flush()
        if payload:
            return payload

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("MP3 encoding requires either the optional lameenc package or ffmpeg on PATH")

    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "s16le",
        "-ar",
        str(int(sample_rate)),
        "-ac",
        str(int(pcm16.shape[1])),
        "-i",
        "pipe:0",
        "-f",
        "mp3",
        "-codec:a",
        "libmp3lame",
        "-b:a",
        f"{max(32, int(bitrate_kbps))}k",
        "pipe:1",
    ]
    completed = subprocess.run(
        command,
        input=pcm16.tobytes(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.decode("utf-8", errors="replace").strip() or "ffmpeg MP3 encoding failed")
    payload = completed.stdout
    if not payload:
        raise ValueError("MP3 encoding returned an empty payload")
    return payload
