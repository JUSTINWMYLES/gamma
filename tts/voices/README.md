# Voice preset packaging

`tts/voices/manifest.json` is the product-facing source of truth for News Broadcast voice presets.

## Current behavior

- `builtin` entries are immediately usable through upstream MOSS-TTS builtin voices.
- `voice_pack` entries reserve stable Gamma preset IDs for future packaged custom voices.
- Placeholder voice-pack entries stay unavailable until their required assets exist.

## Packaging a real voice preset

For each voice-pack entry in the manifest, add assets under `tts/voices/packs/<voice-id>/`.

Current supported packaging path:

- `prompt.wav` — reference/prompt audio used for voice cloning

Optional future additions:

- precomputed prompt audio codes
- curated preview clips in `tts/voices/previews/`

## Deployment readiness

The TTS API supports readiness gating so deployments can require packaged custom voice presets before reporting ready.

Relevant env vars:

- `TTS_REQUIRE_CUSTOM_VOICE_PACK=true`
- `TTS_REQUIRE_WORKER_READY=true`

With the default configuration, builtin voices keep the stack usable while custom packs are still pending.
