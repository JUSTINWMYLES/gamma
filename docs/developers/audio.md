# Audio Assets Guide

This guide lists free, license-compatible audio sources and practical tools for generating game audio for Gamma.

---

## Licensing requirements

All audio used in Gamma must be usable without royalties in a commercial product. The following licences are acceptable:

| Licence | Notes |
|---------|-------|
| CC0 / Public Domain | No attribution required — preferred |
| CC BY 4.0 | Attribution required in `CREDITS.md` |
| CC BY-SA 4.0 | Attribution + derivatives must share-alike |

**Not acceptable:** CC NC (non-commercial), CC ND (no derivatives), standard Copyright without explicit grant.

When in doubt, check the licence on the specific asset page, not just the library homepage — sites like Freesound mix licences freely.

---

## Sources

### Sound effects

| Source | URL | Highlights |
|--------|-----|------------|
| Freesound | https://freesound.org | Huge CC0/BY library; filter by licence in search |
| Kenney Game Assets | https://kenney.nl/assets?q=audio | Entirely CC0; UI hits, footsteps, ambient loops |
| OpenGameArt | https://opengameart.org | Varied CC licences; filter to CC0 in sidebar |
| Sonniss GDC Bundle | https://sonniss.com/gameaudiogdc | Annual ~10 GB royalty-free drop; check each year's terms |
| ZapSplat | https://www.zapsplat.com | Free tier is royalty-free with attribution |

### Music / loops

| Source | URL | Highlights |
|--------|-----|------------|
| Incompetech (Kevin MacLeod) | https://incompetech.com | CC BY; large catalogue of genres and tempos |
| Pixabay Music | https://pixabay.com/music | CC0; growing library of loops |
| ccMixter | https://ccmixter.org | CC BY/SA remixes and originals |
| Free Music Archive | https://freemusicarchive.org | Filter to CC licences |

---

## Generation tools

For custom one-off effects (UI clicks, beeps, buzzes) that do not need to be recorded:

### sfxr / jsfxr

Web-based retro sound generator. Ideal for arcade-style hits, jumps, catches, and alerts.

- Online tool: https://sfxr.me (or https://www.bfxr.net for more controls)
- Exports `.wav` directly in the browser — no install needed.
- Good for: detection ping, caught flash, round-start beep, menu select.

### rFXGen

Desktop tool based on the same wave synthesis as sfxr but with a parameter editor.

- Download: https://raylibtech.itch.io/rfxgen
- Exports `.wav` or `.ogg`.

### ChipTone

Browser-based 8-bit sound designer with more waveform control than sfxr.

- Online tool: https://sfbgames.itch.io/chiptone

### ElevenLabs / Eleven Sound Effects (AI)

For quickly generating non-retro sound effects from a text prompt. Free tier available.

- https://elevenlabs.io/sound-effects
- Use for: ambient tension loops, footstep variants, ambient crowd noise.
- Outputs are royalty-free for projects using the ElevenLabs API or web tool.

---

## File format and placement

### Format

- Use **OGG Vorbis** (`.ogg`) for in-game looping music and longer ambient clips — best cross-browser compression.
- Use **MP3** (`.mp3`) as a fallback alongside OGG for maximum browser compatibility.
- Use **WAV** only during development; convert before committing.

### Recommended encoding settings

| Use case | Format | Bitrate |
|----------|--------|---------|
| UI sound effects | OGG | 64–96 kbps |
| Ambient loops | OGG | 96–128 kbps |
| Music | OGG + MP3 | 128 kbps |

### Directory structure

```
client/
  shared/
    audio/
      sfx/
        caught.ogg
        detection-ping.ogg
        round-start.ogg
        round-end.ogg
        menu-select.ogg
      music/
        lobby-loop.ogg
        lobby-loop.mp3
        tension-loop.ogg
        tension-loop.mp3
```

Both TV and phone clients can import from `../../shared/audio/` using the Vite asset pipeline (`import url from './path/to/file.ogg'` or direct `<audio src="...">` with a Vite `?url` import).

---

## Attribution

If you use CC BY assets, add an entry to `ATTRIBUTIONS.md` at the repo root following the existing format:

```
- "Sound Name" — Author Name
  - Source: https://link-to-asset
  - License: CC BY 4.0
  - License URL: https://creativecommons.org/licenses/by/4.0/
  - Used in: <component or game context>
  - Changes: none
```

Also add a matching entry to `audio/ATTRIBUTION.txt`.

CC0 assets do not require attribution but crediting them is appreciated.

---

## Practical tips

- **Normalise levels.** All sound effects should peak at –3 dBFS so nothing clips or sounds quiet relative to others. Use Audacity (free) or `ffmpeg -af loudnorm` to normalise.
- **Loop music cleanly.** For tension loops, trim the file to a bar boundary. Audacity's "Find Zero Crossings" helps eliminate pops.
- **Preload on game load.** Fetch audio assets in `onLoad()` (or a Svelte `onMount`) so there is no stutter on first play during a round.
- **Mobile autoplay policy.** Browsers block audio playback until the user has interacted with the page. On the phone client, trigger audio only from within a user-gesture handler (e.g. `on:pointerdown`), not from a Colyseus state change listener.
- **Keep effects short.** UI hits should be under 500 ms; catchable effects under 1 s. Long effects can pile up if retriggered rapidly.
