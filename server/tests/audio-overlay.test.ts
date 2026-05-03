import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/utils/audioOverlayObjectStore", () => ({
  buildAudioOverlayClipProxyPath: vi.fn((clipId: string) => `/api/audio-overlay/clips/${clipId}`),
  deleteAudioOverlayClips: vi.fn(async () => {}),
  isAudioOverlayObjectStoreEnabled: vi.fn(() => false),
  storeAudioOverlayClip: vi.fn(async () => null),
}));

import AudioOverlayGame from "../src/games/registry-26-audio-overlay";
import {
  deleteAudioOverlayClips,
  isAudioOverlayObjectStoreEnabled,
  storeAudioOverlayClip,
} from "../src/utils/audioOverlayObjectStore";

function createPlayer(id: string, name: string) {
  return {
    id,
    name,
    score: 0,
    isReady: false,
    isEliminated: false,
    isConnected: true,
    disconnectedAt: 0,
    micPermission: "granted",
  };
}

function createRoomStub(playerIds: string[] = ["p1", "p2", "p3"]) {
  const names = ["Alex", "Blair", "Casey", "Drew"];
  const players = new Map(
    playerIds.map((id, index) => [id, createPlayer(id, names[index] ?? id)]),
  );

  return {
    roomId: "audio-overlay-room",
    state: {
      phase: "in_round",
      selectedGame: "registry-26-audio-overlay",
      hostSessionId: playerIds[0] ?? "",
      phaseStartedAt: 0,
      currentRound: 1,
      isPracticeRound: false,
      roundDurationSecs: 60,
      gameConfig: {
        roundCount: 1,
        timeLimitSecs: 60,
        practiceRoundEnabled: false,
        matchMode: "ffa",
        gameMode: "randomized",
      },
      players,
    },
    broadcast: vi.fn(),
    clients: playerIds.map((id) => ({ sessionId: id, send: vi.fn() })),
  } as any;
}

function getClient(room: ReturnType<typeof createRoomStub>, sessionId: string) {
  return room.clients.find((client: { sessionId: string }) => client.sessionId === sessionId);
}

function migratePlayer(room: ReturnType<typeof createRoomStub>, oldId: string, newId: string, name?: string) {
  const player = room.state.players.get(oldId);
  if (!player) throw new Error(`Missing player ${oldId}`);

  room.state.players.delete(oldId);
  player.id = newId;
  if (name) player.name = name;
  room.state.players.set(newId, player);

  room.clients = room.clients.map((client: { sessionId: string; send: ReturnType<typeof vi.fn> }) =>
    client.sessionId === oldId ? { sessionId: newId, send: vi.fn() } : client,
  );
}

function createSession(overrides: Record<string, unknown> = {}) {
  return {
    categoryChooserId: "p1",
    chosenCategory: "animals",
    categoryResolve: null,
    allowedGifUrls: new Set<string>(),
    selections: new Map(),
    assignments: new Map(),
    votes: new Map<string, string>(),
    recordingOrder: [] as string[],
    currentRecorderIndex: -1,
    recordingWait: null,
    nextRecordingTurnToken: 0,
    votingEligibleVoterIds: new Set<string>(),
    rng: () => 0.5,
    ...overrides,
  };
}

function createAssignment(playerId: string, playerName: string, overrides: Record<string, unknown> = {}) {
  return {
    playerId,
    playerName,
    gifUrl: `https://example.com/${playerId}.gif`,
    gifLabel: `${playerName} GIF`,
    originalPicker: "Someone Else",
    audioBase64: "",
    audioClipId: null,
    audioDurationSecs: 0,
    ...overrides,
  };
}

function createSelection(playerId: string, playerName: string) {
  return {
    playerId,
    playerName,
    gifUrl: `https://example.com/${playerId}.gif`,
    gifLabel: `${playerName} pick`,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const mockedDeleteClips = vi.mocked(deleteAudioOverlayClips);
const mockedObjectStoreEnabled = vi.mocked(isAudioOverlayObjectStoreEnabled);
const mockedStoreClip = vi.mocked(storeAudioOverlayClip);

afterEach(() => {
  vi.clearAllMocks();
  mockedDeleteClips.mockResolvedValue(undefined);
  mockedObjectStoreEnabled.mockReturnValue(false);
  mockedStoreClip.mockResolvedValue(null);
});

describe("AudioOverlayGame recording submission flow", () => {
  it("acknowledges and advances before object-store offload finishes", async () => {
    const room = createRoomStub(["p1", "p2"]);
    const game = new AudioOverlayGame(room) as any;
    const resolveCurrentTurn = vi.fn();
    const storeDeferred = deferred<{ clipId: string } | null>();

    mockedObjectStoreEnabled.mockReturnValue(true);
    mockedStoreClip.mockReturnValue(storeDeferred.promise);

    game.session = createSession({
      assignments: new Map([["p1", createAssignment("p1", "Alex")]]),
      recordingOrder: ["p1", "p2"],
      currentRecorderIndex: 0,
      recordingWait: { playerId: "p1", turnToken: 1, resolve: resolveCurrentTurn },
      nextRecordingTurnToken: 1,
    });

    const submissionPromise = game._handleRecordingSubmission(
      getClient(room, "p1"),
      Buffer.from("hello audio").toString("base64"),
      2.5,
    );

    const outcome = await Promise.race([
      submissionPromise.then(() => "resolved"),
      new Promise((resolve) => setTimeout(() => resolve("timeout"), 25)),
    ]);

    expect(outcome).toBe("resolved");
    expect(resolveCurrentTurn).toHaveBeenCalledOnce();
    expect(game.session.recordingWait).toBeNull();
    expect(room.broadcast).toHaveBeenCalledWith("recording_submitted", { playerId: "p1" });

    const assignment = game.session.assignments.get("p1");
    expect(assignment.audioBase64.length).toBeGreaterThan(0);
    expect(assignment.audioClipId).toBeNull();

    storeDeferred.resolve({ clipId: "clip-1" });
    await flushAsyncWork();

    expect(assignment.audioBase64).toBe("");
    expect(assignment.audioClipId).toBe("clip-1");
  });

  it("does not let a late offload completion disturb the next recorder", async () => {
    const room = createRoomStub(["p1", "p2"]);
    const game = new AudioOverlayGame(room) as any;
    const resolveFirstTurn = vi.fn();
    const resolveSecondTurn = vi.fn();
    const storeDeferred = deferred<{ clipId: string } | null>();

    mockedObjectStoreEnabled.mockReturnValue(true);
    mockedStoreClip.mockReturnValue(storeDeferred.promise);

    game.session = createSession({
      assignments: new Map([
        ["p1", createAssignment("p1", "Alex")],
        ["p2", createAssignment("p2", "Blair")],
      ]),
      recordingOrder: ["p1", "p2"],
      currentRecorderIndex: 0,
      recordingWait: { playerId: "p1", turnToken: 1, resolve: resolveFirstTurn },
      nextRecordingTurnToken: 1,
    });

    await game._handleRecordingSubmission(
      getClient(room, "p1"),
      Buffer.from("first turn audio").toString("base64"),
      1.5,
    );

    game.session.currentRecorderIndex = 1;
    game.session.recordingWait = {
      playerId: "p2",
      turnToken: 2,
      resolve: resolveSecondTurn,
    };

    storeDeferred.resolve({ clipId: "clip-late" });
    await flushAsyncWork();

    expect(resolveFirstTurn).toHaveBeenCalledOnce();
    expect(resolveSecondTurn).not.toHaveBeenCalled();
    expect(game.session.recordingWait?.playerId).toBe("p2");
    expect(game.session.recordingWait?.turnToken).toBe(2);
  });
});

describe("AudioOverlayGame reconnect safety", () => {
  it("migrates session keyed state to the new session id", () => {
    const room = createRoomStub(["old-p1", "p2", "p3"]);
    migratePlayer(room, "old-p1", "new-p1", "Alex Reloaded");

    const game = new AudioOverlayGame(room) as any;
    const recordingWaitResolve = vi.fn();

    game.session = createSession({
      categoryChooserId: "old-p1",
      selections: new Map([
        ["old-p1", createSelection("old-p1", "Alex")],
        ["p2", createSelection("p2", "Blair")],
      ]),
      assignments: new Map([
        ["old-p1", createAssignment("old-p1", "Alex")],
        ["p2", createAssignment("p2", "Blair", { audioBase64: "submitted" })],
      ]),
      votes: new Map([
        ["old-p1", "p2"],
        ["p2", "old-p1"],
      ]),
      recordingOrder: ["old-p1", "p2"],
      currentRecorderIndex: 0,
      recordingWait: { playerId: "old-p1", turnToken: 3, resolve: recordingWaitResolve },
      votingEligibleVoterIds: new Set(["old-p1", "p2", "p3"]),
    });

    game.onPlayerReconnected("old-p1", "new-p1", { sessionId: "new-p1" });

    expect(game.session.categoryChooserId).toBe("new-p1");
    expect(game.session.selections.has("old-p1")).toBe(false);
    expect(game.session.selections.get("new-p1")).toMatchObject({
      playerId: "new-p1",
      playerName: "Alex Reloaded",
    });
    expect(game.session.assignments.has("old-p1")).toBe(false);
    expect(game.session.assignments.get("new-p1")).toMatchObject({
      playerId: "new-p1",
      playerName: "Alex Reloaded",
    });
    expect(game.session.votes.has("old-p1")).toBe(false);
    expect(game.session.votes.get("new-p1")).toBe("p2");
    expect(game.session.votes.get("p2")).toBe("new-p1");
    expect(game.session.recordingOrder).toEqual(["new-p1", "p2"]);
    expect(game.session.recordingWait).toMatchObject({ playerId: "new-p1", turnToken: 3 });
    expect(game.session.votingEligibleVoterIds.has("old-p1")).toBe(false);
    expect(game.session.votingEligibleVoterIds.has("new-p1")).toBe(true);

    const newClient = getClient(room, "new-p1");
    expect(newClient.send).toHaveBeenCalledWith("gif_assigned", expect.objectContaining({
      gifUrl: "https://example.com/old-p1.gif",
      gifLabel: "Alex GIF",
    }));
  });

  it("keeps an offloaded recording attached after reconnecting", async () => {
    const room = createRoomStub(["old-p1", "p2"]);
    const game = new AudioOverlayGame(room) as any;
    const storeDeferred = deferred<{ clipId: string } | null>();

    mockedObjectStoreEnabled.mockReturnValue(true);
    mockedStoreClip.mockReturnValue(storeDeferred.promise);

    game.session = createSession({
      assignments: new Map([["old-p1", createAssignment("old-p1", "Alex")]]),
      recordingOrder: ["old-p1", "p2"],
      currentRecorderIndex: 0,
      recordingWait: { playerId: "old-p1", turnToken: 1, resolve: vi.fn() },
      nextRecordingTurnToken: 1,
    });

    await game._handleRecordingSubmission(
      getClient(room, "old-p1"),
      Buffer.from("reconnect me").toString("base64"),
      1.8,
    );

    migratePlayer(room, "old-p1", "new-p1", "Alex Reloaded");
    game.onPlayerReconnected("old-p1", "new-p1", { sessionId: "new-p1" });

    storeDeferred.resolve({ clipId: "clip-reconnected" });
    await flushAsyncWork();

    const migratedAssignment = game.session.assignments.get("new-p1");
    expect(migratedAssignment).toMatchObject({
      playerId: "new-p1",
      audioClipId: "clip-reconnected",
      audioBase64: "",
    });
    expect(game.session.assignments.has("old-p1")).toBe(false);
  });
});

describe("AudioOverlayGame voting payload guards", () => {
  it("tracks vote progress against playable entries only", () => {
    const room = createRoomStub(["p1", "p2", "p3"]);
    const game = new AudioOverlayGame(room) as any;

    game.session = createSession({
      assignments: new Map([
        ["p1", createAssignment("p1", "Alex", { audioBase64: "audio-a", audioDurationSecs: 1 })],
        ["p2", createAssignment("p2", "Blair", { audioClipId: "clip-b", audioDurationSecs: 1 })],
        ["p3", createAssignment("p3", "Casey")],
      ]),
      votingEligibleVoterIds: new Set(["p1", "p2", "p3"]),
    });

    expect(game._playableAssignments().map((assignment: { playerId: string }) => assignment.playerId)).toEqual([
      "p1",
      "p2",
    ]);
    expect(
      game._eligibleVotersForEntries(game._playableAssignments()).map((player: { id: string }) => player.id),
    ).toEqual(["p1", "p2", "p3"]);

    game._handleVote(getClient(room, "p3"), "p1");
    game._handleVote(getClient(room, "p2"), "p3");
    game._handleVote(getClient(room, "p1"), "p2");

    expect(game.session.votes.has("p2")).toBe(false);
    expect(game.session.votes.get("p3")).toBe("p1");
    expect(game.session.votes.get("p1")).toBe("p2");
    expect(room.broadcast).toHaveBeenLastCalledWith("vote_count_update", {
      votesIn: 2,
      totalVoters: 3,
    });
  });
});
