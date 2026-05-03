/**
 * server/src/games/registry-26-audio-overlay/index.ts
 *
 * "Audio Overlay" — A random player picks a CATEGORY, everyone searches
 * for GIFs using the Klipy API, picks one, gets assigned someone else's pick,
 * records audio over it, then everyone votes for the best.
 *
 * Game flow (single round = full session):
 * ─────────────────────────────────────────
 *   0. CATEGORY_SELECTION (30s) — Random player picks a GIF category.
 *   1. GIF_SELECTION  (120s) — All players search for GIFs via Klipy API and pick one.
 *      The chosen category's search term is used for the initial auto-search.
 *      Players can also search for any term they want.
 *   2. REDISTRIBUTION        — Server shuffles selections and assigns each
 *                              player a *different* player's GIF.
 *   3. RECORDING     (60s/player) — One player at a time records audio over
 *                              their assigned GIF. TV shows recording live.
 *   4. PLAYBACK               — Each GIF+audio combo is played on TV sequentially.
 *   5. VOTING        (30s)    — All players vote for the funniest (can't vote self).
 *   6. RESULTS                — Scores shown.
 *
 * GIF sourcing
 * ────────────
 * All GIFs come from the Klipy GIF Search API (requires KLIPY_API_KEY).
 * There are no hardcoded fallback pools.
 *
 * Server messages → clients:
 *   "category_selection_start" { chooserId, chooserName, categories, durationMs, serverTimestamp }
 *   "category_chosen"          { category, chooserName }
 *   "gif_selection_start"      { gifs, category, searchTerm, durationMs, serverTimestamp, totalSelectors }
 *   "gif_selection_update"     { submitted, total }
 *   "gif_search_results"       { gifs, query }
 *   "gif_assigned"             { gifUrl, gifLabel, originalPicker, maxClipDurationMs, mode }
 *   "recording_prepare"        { playerId, playerName, durationMs, serverTimestamp }
 *   "recording_turn"           { playerId, playerName, durationMs, serverTimestamp, maxClipDurationMs, mode }
 *   "recording_submitted"      { playerId }
 *   "playback_entry"           { playerId, playerName, gifUrl, gifLabel, audioBase64?, audioClipPath?, audioDurationMs, introDurationMs, postDurationMs }
 *   "playback_done"            {}
 *   "voting_start"             { durationMs, entries, serverTimestamp, totalVoters }
 *   "vote_confirmed"           { targetId }
 *   "vote_count_update"        { votesIn, totalVoters }
 *   "round_result"             { winner, scores, entries, category }
 *
 * Client messages ← players:
 *   { action: "select_category", category }
 *   { action: "select_gif", gifUrl, gifLabel }
 *   { action: "search_gifs", query }
 *   { action: "submit_recording", audioBase64, durationSecs }
 *   { action: "vote", targetId }
 */

import { Client } from "@colyseus/core";
import { BaseGame } from "../BaseGame";
import { seededRng } from "../../utils/rng";
import {
  buildAudioOverlayClipProxyPath,
  deleteAudioOverlayClips,
  isAudioOverlayObjectStoreEnabled,
  storeAudioOverlayClip,
} from "../../utils/audioOverlayObjectStore";

// ── Constants ─────────────────────────────────────────────────────────────────

/** Time for the chosen player to pick a category (ms). */
const CATEGORY_SELECTION_DURATION_MS = 30_000;
/** Reveal animation delay after category chosen (ms). */
const CATEGORY_REVEAL_DELAY_MS = 3_000;
/** Time for all players to browse and select a GIF (ms). */
const GIF_SELECTION_DURATION_MS = 120_000;
/** Time each player has to record their audio (ms). */
const RECORDING_DURATION_MS = 60_000;
/** Warning before a player's recording turn starts (ms). */
const RECORDING_PREPARE_MS = 5_000;
/** Small breather between recording turns (ms). */
const RECORDING_TURN_BREAK_MS = 2_500;
/** Max length of a single submitted audio clip (ms). */
const MAX_RECORDING_CLIP_MS = 10_000;
/** Silent GIF intro before the audio starts (ms). */
const PLAYBACK_INTRO_MS = 5_000;
/** Pause after each playback entry finishes (ms). */
const PLAYBACK_POST_ENTRY_MS = 5_000;
/** Voting duration (ms). */
const VOTING_DURATION_MS = 30_000;
/** Results display (ms). */
const RESULTS_DISPLAY_MS = 8_000;

/** Points for each vote received. */
const POINTS_PER_VOTE = 50;
/** Bonus for the most-voted player. */
const WINNER_BONUS = 100;
/** Participation points for submitting a recording. */
const PARTICIPATION_POINTS = 25;

// ── Category & GIF Pool ──────────────────────────────────────────────────────

export interface GifEntry {
  url: string;
  label: string;
}

/** Available GIF categories. */
export type GifCategory =
  | "evil_laughs"
  | "animals"
  | "vehicles"
  | "yells"
  | "dance"
  | "sports"
  | "any";

/** Display info for each category. */
export interface CategoryInfo {
  id: GifCategory;
  name: string;
  icon: string;
  description: string;
}

type AudioOverlayMode = "randomized" | "record_own";

const CATEGORIES: CategoryInfo[] = [
  { id: "evil_laughs", name: "Evil Laughs", icon: "devil", description: "Villains, evil schemes, and maniacal laughter" },
  { id: "animals", name: "Animals", icon: "paw", description: "Cats, dogs, birds, and wild creatures" },
  { id: "vehicles", name: "Vehicles", icon: "car", description: "Cars, planes, boats, and things that go vroom" },
  { id: "yells", name: "Yells & Screams", icon: "megaphone", description: "Shouting, screaming, and dramatic reactions" },
  { id: "dance", name: "Dance & Music", icon: "music", description: "Dancing, grooving, and musical moments" },
  { id: "sports", name: "Sports", icon: "trophy", description: "Athletic feats, celebrations, and epic fails" },
  { id: "any", name: "Anything Goes", icon: "shuffle", description: "A wild mix from every category" },
];

/** Search terms mapped to each category for the Klipy GIF API. */
const CATEGORY_SEARCH_TERMS: Record<GifCategory, string> = {
  evil_laughs: "evil laugh villain",
  animals: "funny animals",
  vehicles: "cars trucks vehicles",
  yells: "yelling screaming reaction",
  dance: "dancing funny moves",
  sports: "sports highlights epic",
  any: "funny reactions",
};

/** Klipy API base URL (v1 — key is a path segment). */
const KLIPY_API_BASE = "https://api.klipy.com/api/v1";

/** How many GIFs to request per page (Klipy accepts 8-50, default 24). */
const KLIPY_PER_PAGE = 30;

/** Timeout for Klipy API requests (ms). */
const KLIPY_FETCH_TIMEOUT_MS = 5_000;

/**
 * Klipy v1 response shape (from https://docs.klipy.com/gifs-api/gifs-search-api).
 *
 *   { "result": true, "data": { "data": [ ... ] } }
 *
 * Each item in data.data[] has:
 *   id, slug, title, file.{sm|md|hd}.{gif|webp|jpg|mp4|webm}.url
 */
interface KlipyGifItem {
  id?: number;
  slug?: string;
  title?: string;
  file?: {
    sm?: { gif?: { url?: string }; webp?: { url?: string } };
    md?: { gif?: { url?: string }; webp?: { url?: string } };
    hd?: { gif?: { url?: string }; webp?: { url?: string } };
  };
}

interface KlipySearchResponse {
  result?: boolean;
  errors?: { message?: string[] };
  data?: {
    data?: KlipyGifItem[];
  };
}

/**
 * Fetch GIFs from the Klipy search API.
 * Returns an empty array on any failure (no hardcoded fallback).
 */
async function fetchKlipyGifs(query: string): Promise<GifEntry[]> {
  const apiKey = process.env.KLIPY_API_KEY;
  if (!apiKey) {
    console.warn(`[AudioOverlay] KLIPY_API_KEY is not set — cannot search GIFs`);
    return [];
  }

  try {
    // Klipy v1: key goes in the URL path, customer_id is required
    const url =
      `${KLIPY_API_BASE}/${encodeURIComponent(apiKey)}/gifs/search` +
      `?q=${encodeURIComponent(query)}` +
      `&per_page=${KLIPY_PER_PAGE}` +
      `&customer_id=gamma-game`;

    console.log(`[AudioOverlay] Klipy search: query="${query}" per_page=${KLIPY_PER_PAGE}`);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), KLIPY_FETCH_TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    console.log(`[AudioOverlay] Klipy response: status=${res.status} for query="${query}"`);

    if (!res.ok || res.status === 204) {
      console.warn(`[AudioOverlay] Klipy API returned ${res.status} for query "${query}"`);
      return [];
    }

    const text = await res.text();
    if (!text || text.trim().length === 0) {
      console.warn(`[AudioOverlay] Klipy API returned empty body for query "${query}"`);
      return [];
    }

    const json = JSON.parse(text) as KlipySearchResponse;

    // { result: false, errors: ... } = auth/request failure
    if (json.result === false) {
      const msg = json.errors?.message?.[0] ?? "unknown error";
      console.warn(`[AudioOverlay] Klipy API error for query "${query}": ${msg}`);
      return [];
    }

    const items = json.data?.data;
    if (!items || !Array.isArray(items)) {
      console.warn(`[AudioOverlay] Klipy API returned no data.data[] for query "${query}"`);
      return [];
    }

    const gifs: GifEntry[] = [];
    for (const item of items) {
      // Prefer small GIF for fast loading; fall back to medium, then webp variants
      const gifUrl =
        item.file?.sm?.gif?.url ??
        item.file?.sm?.webp?.url ??
        item.file?.md?.gif?.url ??
        item.file?.md?.webp?.url;
      if (!gifUrl) continue;
      gifs.push({
        url: gifUrl,
        label: item.title ?? "GIF",
      });
    }

    console.log(`[AudioOverlay] Klipy returned ${gifs.length} GIFs for query "${query}"`);
    return gifs;
  } catch (err) {
    console.warn(`[AudioOverlay] Klipy API fetch failed for query "${query}":`, err);
    return [];
  }
}

// ── Per-session tracking ──────────────────────────────────────────────────────

interface GifSelection {
  playerId: string;
  playerName: string;
  gifUrl: string;
  gifLabel: string;
}

interface GifAssignment {
  playerId: string;
  playerName: string;
  /** The GIF this player must dub (picked by someone else). */
  gifUrl: string;
  gifLabel: string;
  /** Name of the player who originally picked this GIF. */
  originalPicker: string;
  /** Recorded audio as base64 (filled during recording phase). */
  audioBase64: string;
  /** Object-store clip id when the recording was offloaded. */
  audioClipId: string | null;
  /** Client-reported audio duration in seconds, clamped server-side. */
  audioDurationSecs: number;
}

interface RecordingWaitState {
  playerId: string;
  turnToken: number;
  resolve: (() => void) | null;
}

interface SessionData {
  /** The player chosen to pick the category. */
  categoryChooserId: string;
  /** The chosen GIF category for this round. */
  chosenCategory: GifCategory | null;
  /** Resolve function to unblock category selection wait. */
  categoryResolve: (() => void) | null;
  /** All GIF URLs that have been shown to players (initial search + player searches). */
  allowedGifUrls: Set<string>;
  /** Which GIF each player selected in phase 1. */
  selections: Map<string, GifSelection>;
  /** Shuffled assignments for recording. */
  assignments: Map<string, GifAssignment>;
  /** Votes: voterId → targetId. */
  votes: Map<string, string>;
  /** Ordered list of player IDs for sequential recording. */
  recordingOrder: string[];
  /** Index of the player currently recording. */
  currentRecorderIndex: number;
  /** Guarded state for the current recording wait. */
  recordingWait: RecordingWaitState | null;
  /** Monotonic token for recording waits so stale async work cannot resolve a newer turn. */
  nextRecordingTurnToken: number;
  /** Snapshot of who can vote during the current voting phase. */
  votingEligibleVoterIds: Set<string>;
  /** Session-scoped RNG for all random choices. */
  rng: () => number;
}

// ── Game class ────────────────────────────────────────────────────────────────

export default class AudioOverlayGame extends BaseGame {
  static override requiresTV = false;
  static override supportsBracket = false;
  static override defaultRoundCount = 1;
  static override minRounds = 1;
  static override maxRounds = 1;
  static override hasInstructionsPhase = true;
  static override instructionsDelivery = "broadcast" as const;

  static override activityLevel: "none" | "some" | "full" = "none";
  static override requiresSameRoom = true;
  static override requiresSecondaryDisplay = false;

  private session: SessionData | null = null;
  private readonly storedClipIds = new Set<string>();

  private currentMode(): AudioOverlayMode {
    return this.room.state.gameConfig.gameMode === "record_own" ? "record_own" : "randomized";
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  protected override async onLoad(): Promise<void> {
    for (const p of this.room.state.players.values()) {
      p.score = 0;
      p.isReady = false;
      p.isEliminated = false;
    }
  }

  /**
   * The entire game runs as a single "round" since the flow
   * (category → select → record → playback → vote) is one continuous session.
   */
  protected override async runRound(_round: number): Promise<void> {
    const players = this._recordingEligiblePlayers();
    const mode = this.currentMode();
    if (players.length < 2) {
      this.broadcast("round_skipped", { reason: "Need at least 2 microphone-ready players" });
      return;
    }

    const rng = this._createSessionRng(_round, players.map((player) => player.id));

    // Pick a random player to choose the category
    const chooser = players[this._randomIndex(players.length, rng)];

    this.session = {
      categoryChooserId: chooser.id,
      chosenCategory: null,
      categoryResolve: null,
      allowedGifUrls: new Set(),
      selections: new Map(),
      assignments: new Map(),
      votes: new Map(),
      recordingOrder: [],
      currentRecorderIndex: -1,
      recordingWait: null,
      nextRecordingTurnToken: 0,
      votingEligibleVoterIds: new Set(),
      rng,
    };

    // ── Phase 0: Category Selection ─────────────────────────────────────
    this.broadcast("category_selection_start", {
      chooserId: chooser.id,
      chooserName: chooser.name,
      categories: CATEGORIES,
      durationMs: CATEGORY_SELECTION_DURATION_MS,
      serverTimestamp: Date.now(),
    });

    await this._waitForCategoryOrTimeout(CATEGORY_SELECTION_DURATION_MS);
    if (!this.session) return; // Room disposed during wait

    // Auto-pick random category if chooser didn't pick
    if (!this.session.chosenCategory) {
      // Pick a random non-"any" category for variety
      const pickable = CATEGORIES.filter((c) => c.id !== "any");
      const auto = pickable[this._randomIndex(pickable.length, this.session.rng)];
      this.session.chosenCategory = auto.id;
    }

    const chosenCategoryInfo = CATEGORIES.find(
      (c) => c.id === this.session!.chosenCategory,
    ) ?? CATEGORIES[0];

    this.broadcast("category_chosen", {
      category: chosenCategoryInfo,
      chooserName: chooser.name,
    });

    // Brief reveal delay
    await this.delay(CATEGORY_REVEAL_DELAY_MS);
    if (!this.session) return; // Room disposed during delay

    // ── Phase 1: GIF Selection ──────────────────────────────────────────
    // Auto-search with the category's search term to give players initial results
    const searchTerm = CATEGORY_SEARCH_TERMS[this.session.chosenCategory] ?? CATEGORY_SEARCH_TERMS["any"];
    const initialGifs = await fetchKlipyGifs(searchTerm);
    if (!this.session) return; // Room disposed during API call

    // Track all initial GIF URLs as valid selections
    for (const g of initialGifs) this.session.allowedGifUrls.add(g.url);

    this.broadcast("gif_selection_start", {
      gifs: initialGifs,
      category: chosenCategoryInfo,
      searchTerm,
      durationMs: GIF_SELECTION_DURATION_MS,
      serverTimestamp: Date.now(),
      totalSelectors: players.length,
    });

    // Reset ready flags for selection tracking
    for (const p of players) {
      p.isReady = false;
    }

    await this._waitForAllSelectionsOrTimeout(GIF_SELECTION_DURATION_MS);
    if (!this.session) return; // Room disposed during wait

    // Auto-assign a random GIF to anyone who didn't pick
    // Use all allowed GIF URLs (initial results + any search results)
    const allAllowed = [...this.session.allowedGifUrls];
    for (const p of players) {
      if (!this.session.selections.has(p.id)) {
        if (allAllowed.length > 0) {
          const randomUrl = allAllowed[this._randomIndex(allAllowed.length, this.session.rng)];
          this.session.selections.set(p.id, {
            playerId: p.id,
            playerName: p.name,
            gifUrl: randomUrl,
            gifLabel: "GIF",
          });
        }
        // If no GIFs were ever loaded (API completely down), player just gets skipped
      }
    }

    // ── Phase 2: Redistribution ─────────────────────────────────────────
    this._redistributeGifs();
    if (!this.session) return;

    // ── Phase 3: Sequential Recording ───────────────────────────────────
    const order = this.session.recordingOrder;
    for (let i = 0; i < order.length; i++) {
      if (!this.session) return; // Room disposed between recordings
      this.session.currentRecorderIndex = i;
      const playerId = order[i];
      const assignment = this.session.assignments.get(playerId);
      if (!assignment) continue;

      this.send(playerId, "gif_assigned", {
        gifUrl: assignment.gifUrl,
        gifLabel: assignment.gifLabel,
        originalPicker: assignment.originalPicker,
        maxClipDurationMs: MAX_RECORDING_CLIP_MS,
        mode,
      });

      this.broadcast("recording_prepare", {
        playerId: assignment.playerId,
        playerName: assignment.playerName,
        durationMs: RECORDING_PREPARE_MS,
        serverTimestamp: Date.now(),
      });

      await this.delay(RECORDING_PREPARE_MS);
      if (!this.session) return;

      this.broadcast("recording_turn", {
        playerId: assignment.playerId,
        playerName: assignment.playerName,
        durationMs: RECORDING_DURATION_MS,
        serverTimestamp: Date.now(),
        maxClipDurationMs: MAX_RECORDING_CLIP_MS,
        mode,
      });

      // Wait for recording submission or timeout
      await this._waitForRecordingOrTimeout(playerId, RECORDING_DURATION_MS);
      if (!this.session) return;

      await this.delay(RECORDING_TURN_BREAK_MS);
    }

    if (!this.session) return; // Room disposed during recordings

    // ── Phase 4: TV Playback ────────────────────────────────────────────
    const assignments = this._playableAssignments();

    for (const entry of assignments) {
      if (!this.session) return;
      const audioDurationMs = Math.min(
        MAX_RECORDING_CLIP_MS,
        Math.max(250, Math.round((entry.audioDurationSecs || MAX_RECORDING_CLIP_MS / 1000) * 1000)),
      );

      this.broadcast("playback_entry", {
        playerId: entry.playerId,
        playerName: entry.playerName,
        gifUrl: entry.gifUrl,
        gifLabel: entry.gifLabel,
        audioBase64: entry.audioBase64 || undefined,
        audioClipPath: entry.audioClipId
          ? buildAudioOverlayClipProxyPath(entry.audioClipId)
          : undefined,
        audioDurationMs,
        introDurationMs: PLAYBACK_INTRO_MS,
        postDurationMs: PLAYBACK_POST_ENTRY_MS,
      });
      await this.delay(PLAYBACK_INTRO_MS + audioDurationMs + PLAYBACK_POST_ENTRY_MS);
    }
    if (!this.session) return;
    this.broadcast("playback_done", {});

    // ── Phase 5: Voting ─────────────────────────────────────────────────
    const eligibleVoters = this._eligibleVotersForEntries(assignments);
    this.session.votingEligibleVoterIds = new Set(
      eligibleVoters.map((player) => player.id),
    );

    if (assignments.length >= 2 && eligibleVoters.length > 0) {
      this.broadcast("voting_start", {
        durationMs: VOTING_DURATION_MS,
        serverTimestamp: Date.now(),
        totalVoters: eligibleVoters.length,
        entries: assignments.map((a) => ({
          playerId: a.playerId,
          playerName: a.playerName,
          gifUrl: a.gifUrl,
          gifLabel: a.gifLabel,
        })),
      });

      await this._waitForAllVotesOrTimeout(VOTING_DURATION_MS);
    }

    if (!this.session) return;
    this.session.votingEligibleVoterIds.clear();

    // ── Phase 6: Results ────────────────────────────────────────────────
    const results = this._computeResults();
    this.broadcast("round_result", results);
    await this.delay(RESULTS_DISPLAY_MS);
  }

  protected override scoreRound(_round: number): void {
    if (!this.session) return;
    const results = this._computeResults();
    for (const [playerId, points] of Object.entries(results.scores)) {
      const player = this.room.state.players.get(playerId);
      if (player) {
        player.score += points;
      }
    }
  }

  override handleInput(client: Client, data: unknown): void {
    const input = data as {
      action?: string;
      gifUrl?: string;
      gifLabel?: string;
      audioBase64?: string;
      durationSecs?: number;
      targetId?: string;
      category?: string;
      query?: string;
    };
    if (!input || !input.action) return;

    switch (input.action) {
      case "select_category":
        this._handleCategorySelection(client, input.category);
        break;
      case "select_gif":
        this._handleGifSelection(client, input.gifUrl, input.gifLabel);
        break;
      case "search_gifs":
        this._handleGifSearch(client, input.query);
        break;
      case "submit_recording":
        void this._handleRecordingSubmission(client, input.audioBase64, input.durationSecs);
        break;
      case "vote":
        this._handleVote(client, input.targetId);
        break;
    }
  }

  override teardown(): void {
    super.teardown();
    // Resolve any pending waits
    if (this.session?.recordingWait?.resolve) {
      this.session.recordingWait.resolve();
      this.session.recordingWait = null;
    }
    if (this.session?.categoryResolve) {
      this.session.categoryResolve();
    }
    this.session = null;
    const clipIds = [...this.storedClipIds];
    this.storedClipIds.clear();
    void deleteAudioOverlayClips(clipIds);
  }

  override onPlayerReconnected(oldId: string, newId: string, _client: Client): void {
    if (!this.session) return;

    if (this.session.categoryChooserId === oldId) {
      this.session.categoryChooserId = newId;
    }

    const currentName = this.room.state.players.get(newId)?.name;

    this._moveMapValue(this.session.selections, oldId, newId, (selection) => {
      selection.playerId = newId;
      if (currentName) selection.playerName = currentName;
    });

    this._moveMapValue(this.session.assignments, oldId, newId, (assignment) => {
      assignment.playerId = newId;
      if (currentName) assignment.playerName = currentName;
    });

    if (this.session.votes.has(oldId)) {
      const targetId = this.session.votes.get(oldId) ?? "";
      this.session.votes.delete(oldId);
      this.session.votes.set(newId, targetId === oldId ? newId : targetId);
    }
    for (const [voterId, targetId] of [...this.session.votes.entries()]) {
      if (targetId === oldId) {
        this.session.votes.set(voterId, newId);
      }
    }

    this.session.recordingOrder = this.session.recordingOrder.map((playerId) =>
      playerId === oldId ? newId : playerId,
    );

    if (this.session.recordingWait?.playerId === oldId) {
      this.session.recordingWait.playerId = newId;
    }

    this._moveSetValue(this.session.votingEligibleVoterIds, oldId, newId);

    const assignment = this.session.assignments.get(newId);
    if (assignment && !this._assignmentHasPlayableAudio(assignment)) {
      this.send(newId, "gif_assigned", {
        gifUrl: assignment.gifUrl,
        gifLabel: assignment.gifLabel,
        originalPicker: assignment.originalPicker,
        maxClipDurationMs: MAX_RECORDING_CLIP_MS,
        mode: this.currentMode(),
      });
    }
  }

  // ── Input handlers ────────────────────────────────────────────────────────

  private _handleCategorySelection(client: Client, category?: string): void {
    if (!this.session || !category) return;
    // Only the chosen player can pick
    if (client.sessionId !== this.session.categoryChooserId) return;
    // Already chosen
    if (this.session.chosenCategory) return;
    // Validate category
    const valid = CATEGORIES.find((c) => c.id === category);
    if (!valid) return;

    this.session.chosenCategory = valid.id;

    // Unblock the wait
    if (this.session.categoryResolve) {
      this.session.categoryResolve();
      this.session.categoryResolve = null;
    }
  }

  private _handleGifSelection(client: Client, gifUrl?: string, gifLabel?: string): void {
    if (!this.session || !gifUrl) return;
    const player = this.room.state.players.get(client.sessionId);
    if (!player) return;
    if (!this.hasMicPermission(player)) return;

    // Validate that the GIF was shown to this player (initial search or player searches)
    if (!this.session.allowedGifUrls.has(gifUrl)) return;

    const label = gifLabel ?? "GIF";

    // Already selected? Overwrite (let them change their mind)
    this.session.selections.set(client.sessionId, {
      playerId: client.sessionId,
      playerName: player.name,
      gifUrl,
      gifLabel: label,
    });
    player.isReady = true;

    this.send(client.sessionId, "gif_selection_confirmed", { gifUrl });

    // Broadcast progress
    this.broadcast("gif_selection_update", {
      submitted: this.session.selections.size,
      total: this._recordingEligiblePlayers().length,
    });
  }

  /**
   * Handle a player's GIF search request. Queries the Klipy API and sends
   * results back to only the requesting player. Also adds the returned URLs
   * to allowedGifUrls so they can be selected.
   */
  private async _handleGifSearch(client: Client, query?: string): Promise<void> {
    if (!this.session || !query) return;
    const player = this.room.state.players.get(client.sessionId);
    if (!this.hasMicPermission(player)) return;
    // Sanitize: trim, cap length, must have content
    const q = query.trim().slice(0, 80);
    if (q.length < 2) return;

    const results = await fetchKlipyGifs(q);
    if (!this.session) return; // Room may have disposed during fetch

    // Register these URLs as valid selections
    for (const g of results) this.session.allowedGifUrls.add(g.url);
    this.send(client.sessionId, "gif_search_results", { gifs: results, query: q });
  }

  private async _handleRecordingSubmission(
    client: Client,
    audioBase64?: string,
    durationSecs?: number,
  ): Promise<void> {
    if (!this.session || !audioBase64) return;
    const player = this.room.state.players.get(client.sessionId);
    if (!this.hasMicPermission(player)) return;

    const recordingWait = this.session.recordingWait;
    if (!recordingWait || recordingWait.playerId !== client.sessionId) return;

    // Only accept from the current recorder
    const currentId = this._currentRecorderId();
    if (client.sessionId !== currentId) return;

    // Size cap (~2MB encoded)
    if (audioBase64.length > 2_800_000) return;

    const assignment = this.session.assignments.get(client.sessionId);
    if (!assignment) return;
    if (this._assignmentHasPlayableAudio(assignment)) return;

    let clipBytes: Buffer | null = null;
    try {
      clipBytes = Buffer.from(audioBase64, "base64");
    } catch {
      return;
    }
    if (clipBytes.byteLength === 0) return;

    assignment.audioBase64 = audioBase64;
    assignment.audioClipId = null;
    assignment.audioDurationSecs =
      Number.isFinite(durationSecs) && (durationSecs as number) > 0
        ? Math.min(MAX_RECORDING_CLIP_MS / 1000, durationSecs as number)
        : MAX_RECORDING_CLIP_MS / 1000;

    this.broadcast("recording_submitted", { playerId: client.sessionId });

    this._resolveRecordingWait(client.sessionId, recordingWait.turnToken);

    if (isAudioOverlayObjectStoreEnabled()) {
      void this._offloadRecordingAssignment(assignment, clipBytes);
    }
  }

  private _handleVote(client: Client, targetId?: string): void {
    if (!this.session || !targetId) return;
    const player = this.room.state.players.get(client.sessionId);
    if (!this.hasMicPermission(player)) return;
    const eligibleVoterIds = new Set(this._currentVotingEligibleVoterIds());
    if (eligibleVoterIds.size === 0 || !eligibleVoterIds.has(client.sessionId)) return;
    if (targetId === client.sessionId) return; // can't vote for self
    if (this.session.votes.has(client.sessionId)) return; // already voted
    const targetAssignment = this._playableAssignments().find(
      (assignment) => assignment.playerId === targetId,
    );
    if (!targetAssignment) return;

    this.session.votes.set(client.sessionId, targetId);
    this.send(client.sessionId, "vote_confirmed", { targetId });

    this.broadcast("vote_count_update", {
      votesIn: this._votesInCount(),
      totalVoters: eligibleVoterIds.size,
    });
  }

  private async _offloadRecordingAssignment(
    assignment: GifAssignment,
    clipBytes: Buffer,
  ): Promise<void> {
    try {
      const stored = await storeAudioOverlayClip(clipBytes, "audio/webm");
      if (!stored) return;

      if (!this.session || this.isCancelled()) {
        await deleteAudioOverlayClips([stored.clipId]);
        return;
      }

      const assignmentStillPresent = [...this.session.assignments.values()].some(
        (candidate) => candidate === assignment,
      );
      if (!assignmentStillPresent) {
        await deleteAudioOverlayClips([stored.clipId]);
        return;
      }

      assignment.audioClipId = stored.clipId;
      assignment.audioBase64 = "";
      this.storedClipIds.add(stored.clipId);
    } catch (error) {
      console.warn(`[AudioOverlay] Failed to offload recording for ${assignment.playerId}:`, error);
    }
  }

  // ── Redistribution ────────────────────────────────────────────────────────

  /**
   * Shuffle GIF selections so each player dubs someone else's pick.
   * Uses a derangement (no one gets their own selection).
   */
  private _redistributeGifs(): void {
    if (!this.session) return;

    const mode = this.currentMode();
    const playerIds = [...this.session.selections.keys()];
    const selections = [...this.session.selections.values()];

    const n = playerIds.length;
    const assignmentIndexes =
      mode === "record_own"
        ? Array.from({ length: n }, (_, i) => i)
        : this._derangement(n);

    const order: string[] = [];

    for (let i = 0; i < n; i++) {
      const assigneeId = playerIds[i];
      const assigneeName =
        this.room.state.players.get(assigneeId)?.name ?? "Player";
      const source = selections[assignmentIndexes[i]];

      this.session.assignments.set(assigneeId, {
        playerId: assigneeId,
        playerName: assigneeName,
        gifUrl: source.gifUrl,
        gifLabel: source.gifLabel,
        originalPicker: source.playerName,
        audioBase64: "",
        audioClipId: null,
        audioDurationSecs: 0,
      });

      order.push(assigneeId);
    }

    // Shuffle recording order
    this._shuffleInPlace(order, this.session.rng);

    this.session.recordingOrder = order;
  }

  /**
   * Generate a random derangement of [0..n-1].
   * A derangement is a permutation where no element appears in its original position.
   */
  private _derangement(n: number): number[] {
    if (n <= 1) return [0]; // Edge case: can't derange a single element
    const rng = this.session?.rng;
    if (!rng) return Array.from({ length: n }, (_, i) => i);

    // Simple rejection method — expected ~e attempts
    const original = Array.from({ length: n }, (_, i) => i);
    let perm: number[];
    do {
      perm = [...original];
      this._shuffleInPlace(perm, rng);
    } while (perm.some((val, idx) => val === idx));

    return perm;
  }

  // ── Wait helpers ──────────────────────────────────────────────────────────

  private _activePlayers() {
    return [...this.room.state.players.values()].filter(
      (p) => this.isPlayerActive(p),
    );
  }

  private _recordingEligiblePlayers() {
    return this._activePlayers().filter((p) => this.hasMicPermission(p));
  }

  private async _waitForCategoryOrTimeout(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.session?.chosenCategory) {
        resolve();
        return;
      }
      if (this.session) {
        this.session.categoryResolve = resolve;
      }
      setTimeout(() => {
        if (this.session) {
          this.session.categoryResolve = null;
        }
        resolve();
      }, timeoutMs);
    });
  }

  private async _waitForAllSelectionsOrTimeout(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const active = this._recordingEligiblePlayers();
        const allSelected = active.every((p) =>
          this.session?.selections.has(p.id),
        );
        if (allSelected) {
          clearInterval(check);
          resolve();
        }
      }, 300);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, timeoutMs);
    });
  }

  private async _waitForRecordingOrTimeout(
    playerId: string,
    timeoutMs: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      // If player already submitted (shouldn't happen, but safety)
      const assignment = this.session?.assignments.get(playerId);
      if (assignment && this._assignmentHasPlayableAudio(assignment)) {
        resolve();
        return;
      }

      let turnToken = -1;
      if (this.session) {
        turnToken = this.session.nextRecordingTurnToken + 1;
        this.session.nextRecordingTurnToken = turnToken;
        this.session.recordingWait = {
          playerId,
          turnToken,
          resolve,
        };
      }

      setTimeout(() => {
        const recordingWait = this.session?.recordingWait;
        if (
          this.session &&
          recordingWait &&
          recordingWait.turnToken === turnToken &&
          recordingWait.resolve === resolve
        ) {
          this.session.recordingWait = null;
        }
        resolve();
      }, timeoutMs + 6000); // +6s grace for encoding/network jitter on slower phones
    });
  }

  private async _waitForAllVotesOrTimeout(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const hasVotingRoster = this._currentVotingEligibleVoterIds().length > 0;
      if (!hasVotingRoster) {
        resolve();
        return;
      }

      const check = setInterval(() => {
        const eligibleVoterIds = this._currentVotingEligibleVoterIds();
        const allVoted = eligibleVoterIds.every((playerId) =>
          this.session?.votes.has(playerId),
        );
        if (allVoted) {
          clearInterval(check);
          resolve();
        }
      }, 200);
      setTimeout(() => {
        clearInterval(check);
        resolve();
      }, timeoutMs);
    });
  }

  // ── Scoring ───────────────────────────────────────────────────────────────

  private _computeResults(): {
    winner: string | null;
    scores: Record<string, number>;
    category: string;
    entries: {
      playerId: string;
      playerName: string;
      gifUrl: string;
      gifLabel: string;
      voteCount: number;
    }[];
  } {
    if (!this.session)
      return { winner: null, scores: {}, category: "any", entries: [] };

    const voteCounts = new Map<string, number>();
    for (const targetId of this.session.votes.values()) {
      voteCounts.set(targetId, (voteCounts.get(targetId) ?? 0) + 1);
    }

    const scores: Record<string, number> = {};
    let maxVotes = 0;
    let winner: string | null = null;

    const entries = [...this.session.assignments.values()]
      .filter((a) => this._assignmentHasPlayableAudio(a))
      .map((a) => {
        const vc = voteCounts.get(a.playerId) ?? 0;
        scores[a.playerId] = PARTICIPATION_POINTS + vc * POINTS_PER_VOTE;
        if (vc > maxVotes) {
          maxVotes = vc;
          winner = a.playerId;
        }
        return {
          playerId: a.playerId,
          playerName: a.playerName,
          gifUrl: a.gifUrl,
          gifLabel: a.gifLabel,
          voteCount: vc,
        };
      });

    // Winner bonus
    if (winner && maxVotes > 0) {
      scores[winner] += WINNER_BONUS;
    }

    // Non-submitters get 0
    for (const p of this._activePlayers()) {
      if (!(p.id in scores)) {
        scores[p.id] = 0;
      }
    }

    return {
      winner,
      scores,
      category: this.session.chosenCategory ?? "any",
      entries,
    };
  }

  private _assignmentHasPlayableAudio(assignment: GifAssignment): boolean {
    return assignment.audioBase64.length > 0 || assignment.audioClipId !== null;
  }

  private _playableAssignments(): GifAssignment[] {
    if (!this.session) return [];
    return [...this.session.assignments.values()].filter((assignment) =>
      this._assignmentHasPlayableAudio(assignment),
    );
  }

  private _eligibleVotersForEntries(entries: GifAssignment[]) {
    if (entries.length < 2) return [];
    const entryPlayerIds = [...new Set(entries.map((entry) => entry.playerId))];
    return this._recordingEligiblePlayers().filter((player) =>
      entryPlayerIds.some((entryPlayerId) => entryPlayerId !== player.id),
    );
  }

  private _currentVotingEligibleVoterIds(): string[] {
    return this.session ? [...this.session.votingEligibleVoterIds] : [];
  }

  private _votesInCount(): number {
    if (!this.session) return 0;
    const eligibleVoterIds = new Set(this._currentVotingEligibleVoterIds());
    if (eligibleVoterIds.size === 0) return 0;

    let votesIn = 0;
    for (const voterId of this.session.votes.keys()) {
      if (eligibleVoterIds.has(voterId)) votesIn += 1;
    }
    return votesIn;
  }

  private _currentRecorderId(): string | null {
    if (!this.session) return null;
    const { currentRecorderIndex, recordingOrder } = this.session;
    if (currentRecorderIndex < 0 || currentRecorderIndex >= recordingOrder.length) {
      return null;
    }
    return recordingOrder[currentRecorderIndex] ?? null;
  }

  private _resolveRecordingWait(playerId: string, turnToken: number): void {
    const recordingWait = this.session?.recordingWait;
    if (
      !this.session ||
      !recordingWait ||
      recordingWait.playerId !== playerId ||
      recordingWait.turnToken !== turnToken
    ) {
      return;
    }

    const resolve = recordingWait.resolve;
    this.session.recordingWait = null;
    resolve?.();
  }

  private _moveMapValue<T>(
    map: Map<string, T>,
    oldId: string,
    newId: string,
    update?: (value: T) => void,
  ): void {
    if (!map.has(oldId)) return;
    const value = map.get(oldId) as T;
    map.delete(oldId);
    update?.(value);
    map.set(newId, value);
  }

  private _moveSetValue(set: Set<string>, oldId: string, newId: string): void {
    if (set.delete(oldId)) {
      set.add(newId);
    }
  }

  private _createSessionRng(round: number, playerIds: string[]): () => number {
    const seedSource = `${this.room.roomId}:${round}:${Date.now()}:${playerIds.sort().join(",")}`;
    let seed = 2166136261;
    for (let i = 0; i < seedSource.length; i++) {
      seed ^= seedSource.charCodeAt(i);
      seed = Math.imul(seed, 16777619);
    }
    return seededRng(seed >>> 0);
  }

  private _randomIndex(length: number, rng: () => number): number {
    if (length <= 1) return 0;
    return Math.floor(rng() * length);
  }

  private _shuffleInPlace<T>(items: T[], rng: () => number): void {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
  }
}
