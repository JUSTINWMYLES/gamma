# ADR-006: Control Modes — Joystick vs Tilt

**Date:** 2025-03
**Status:** Active

## Context

Device games can be controlled via a virtual joystick (thumb touch) or device tilt (DeviceOrientation API). Players have different preferences and not all devices support tilt.

## Decision

Both modes are available for games that opt in. The player selects their preferred control mode from the game screen. The selection is stored per-player client-side only. The server receives the same normalised `{ action: "move", dx, dy }` messages regardless of control mode.

## Rationale

- Tilt control is more immersive but can be uncomfortable for long sessions or poor device orientation.
- Joystick is reliable on all devices and works when the device is flat on a table.
- Keeping the wire protocol identical means server game plugins require no changes per control mode.

## Consequences

- `GameConfig` does not include a control mode field — it is purely client-side preference.
- The `GameScreen.svelte` renders either a joystick or activates the `DeviceOrientationEvent` listener based on the player's local selection.
- iOS requires a user-gesture permission request for `DeviceOrientationEvent`.
- Control mode preference is persisted in `localStorage` under `gamma_control_mode`.
