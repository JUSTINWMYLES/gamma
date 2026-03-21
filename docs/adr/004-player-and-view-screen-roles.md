# ADR-004: Player and View-Screen Roles

**Date:** 2025-01
**Status:** Active

## Context

Two distinct client roles are needed: a shared display and individual device controllers. Originally modelled as "TV" and "phone", but the platform should not be restricted to those specific hardware types — a laptop can act as the display, and any browser-capable device can be a controller.

## Decision

Two role values in `JoinOptions.role`:
- `"player"` — a controlling device (phone, tablet, laptop). Creates a `PlayerState` entry. The first player to join without a view screen present becomes the host/admin.
- `"view_screen"` — a shared display (TV, laptop browser, projector). Does not create a `PlayerState`; sets `viewScreenConnected = true` and takes the host role.

Two separate Vite apps exist (`client/tv` port 5173, `client/phone` port 5174) but either can connect as either role — the role is passed at join time, not baked into the build.

## Rationale

- Removing the "TV" / "phone" language makes it clear that any device can fill either role.
- A player who creates a room (no view screen present) becomes the admin and drives the setup wizard from their phone.
- If a view screen joins later, it takes over the admin/host display role naturally.
- The `hostSessionId` on `RoomState` always points to whoever is currently the admin, regardless of device type.

## Consequences

- `GammaRoom` checks `options.role === "view_screen"` (previously `"tv"`) on join.
- `RoomState.tvConnected` renamed to `viewScreenConnected` for clarity.
- `colyseusClient.ts` exports `hostRoom()` (joins as `"view_screen"`) and `createRoom(name)` (joins as `"player"` and becomes host).
- The setup wizard (3-step flow) runs on whichever client holds `hostSessionId` — TV screen if present, otherwise the creating player's phone.
- Games that `requiresSecondaryDisplay` still gate on `state.viewScreenConnected`.
