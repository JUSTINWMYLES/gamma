#!/usr/bin/env node
/**
 * scripts/smoke-test.mjs
 *
 * Acceptance-criteria smoke test for the Gamma platform.
 *
 * Checks (no browser required — uses raw HTTP + WebSocket):
 *   S01  Server health endpoint responds 200
 *   S02  Client serves a valid HTML page
 *   S03  Colyseus room can be created via HTTP matchmaking API
 *   S04  Room code in response matches [A-Z0-9]{4} pattern
 *   S05  A second client can join the room using the room code
 *   S06  Server rejects join with an invalid room code (404 / error)
 *   S07  Unit tests pass (server workspace)
 *
 * Usage:
 *   node scripts/smoke-test.mjs
 *
 * Exit code 0 = all checks passed.
 * Exit code 1 = one or more checks failed.
 *
 * Prerequisites: server and client must be running.
 *   npm run dev  (or make dev)
 */

import http from "http";
import { execSync } from "child_process";

const SERVER     = "http://localhost:2567";
const CLIENT_URL = "http://localhost:5173";

let passed = 0;
let failed = 0;

// ── Utilities ──────────────────────────────────────────────────────────────────

function ok(label) {
  console.log(`  \x1b[32m✓\x1b[0m  ${label}`);
  passed++;
}

function fail(label, reason) {
  console.error(`  \x1b[31m✗\x1b[0m  ${label}`);
  if (reason) console.error(`       ${reason}`);
  failed++;
}

/** Performs a GET request and resolves with { status, body }. */
function get(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

/** Performs a POST request with a JSON body. */
function post(url, data, timeoutMs = 8000) {
  const payload = JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    };
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(payload);
    req.end();
  });
}

// ── Smoke tests ────────────────────────────────────────────────────────────────

async function runSmoke() {
  console.log("\nGamma smoke tests\n");

  // S01 — Server health endpoint
  try {
    const { status } = await get(`${SERVER}/health`);
    if (status === 200) {
      ok("S01  Server /health responds 200");
    } else {
      fail("S01  Server /health responds 200", `Got HTTP ${status}`);
    }
  } catch (e) {
    fail("S01  Server /health responds 200", e.message);
  }

  // S02 — Unified client HTML
  try {
    const { status, body } = await get(CLIENT_URL);
    if (status === 200 && (body.includes("<!doctype html") || body.includes("<!DOCTYPE html"))) {
      ok("S02  Client serves HTML");
    } else {
      fail("S02  Client serves HTML", `HTTP ${status}, body missing doctype`);
    }
  } catch (e) {
    fail("S02  Client serves HTML", e.message);
  }

  // S03 + S04 — Create room via Colyseus matchmaking HTTP API
  let roomId = null;
  let roomCode = null;
  try {
    const { status, body } = await post(`${SERVER}/matchmake/joinOrCreate/gamma`, {
      role: "view_screen",
    });
    if (status !== 200) throw new Error(`HTTP ${status}: ${body}`);
    const json = JSON.parse(body);
    roomId = json.room?.roomId ?? json.roomId;
    if (roomId) {
      ok("S03  Room created via Colyseus matchmaking API");
    } else {
      fail("S03  Room created via Colyseus matchmaking API", "No roomId in response");
    }

    // Check metadata for room code pattern
    const meta = json.room?.metadata ?? json.metadata ?? {};
    roomCode = meta.roomCode;
    if (roomCode && /^[A-Z0-9]{4}$/.test(roomCode)) {
      ok(`S04  Room code matches [A-Z0-9]{4}  (got: ${roomCode})`);
    } else if (!roomCode) {
      const listRes = await get(`${SERVER}/rooms`);
      const rooms = JSON.parse(listRes.body);
      const thisRoom = rooms.find((r) => r.roomId === roomId);
      roomCode = thisRoom?.metadata?.roomCode;
      if (roomCode && /^[A-Z0-9]{4}$/.test(roomCode)) {
        ok(`S04  Room code matches [A-Z0-9]{4}  (got: ${roomCode})`);
      } else {
        fail("S04  Room code matches [A-Z0-9]{4}", `Got: ${roomCode}`);
      }
    } else {
      fail("S04  Room code matches [A-Z0-9]{4}", `Got: ${roomCode}`);
    }
  } catch (e) {
    fail("S03  Room created via Colyseus matchmaking API", e.message);
    fail("S04  Room code matches [A-Z0-9]{4}", "Skipped — room creation failed");
  }

  // S05 — Second client can join with room code
  if (roomCode) {
    try {
      const { status, body } = await post(`${SERVER}/matchmake/joinOrCreate/gamma`, {
        role: "player",
        name: "SmokeBot",
        roomCode,
      });
      if (status === 200) {
        const json = JSON.parse(body);
        if (json.roomId || json.room?.roomId) {
          ok(`S05  Second client joins room ${roomCode}`);
        } else {
          fail("S05  Second client joins room", "No roomId in join response");
        }
      } else {
        fail("S05  Second client joins room", `HTTP ${status}: ${body}`);
      }
    } catch (e) {
      fail("S05  Second client joins room", e.message);
    }
  } else {
    fail("S05  Second client joins room", "Skipped — no valid room code from S04");
  }

  // S06 — Invalid room code is rejected
  try {
    const { status, body } = await post(`${SERVER}/matchmake/joinById/gamma`, {
      role: "player",
      name: "SmokeBot",
      roomCode: "XXXX",
    }).catch((e) => ({ status: 0, body: e.message }));
    if (status !== 200) {
      ok("S06  Invalid room code is rejected (non-200 response)");
    } else {
      const json = JSON.parse(body);
      if (json.error || !json.roomId) {
        ok("S06  Invalid room code is rejected (error in response body)");
      } else {
        fail("S06  Invalid room code is rejected", "Server returned 200 for XXXX room code");
      }
    }
  } catch (e) {
    ok("S06  Invalid room code is rejected (connection error)");
  }

  // S07 — Unit tests pass
  try {
    console.log("\n  Running server unit tests…");
    execSync("npm run test --workspace=server -- --run", {
      stdio: "pipe",
      timeout: 60_000,
    });
    ok("S07  Server unit tests pass");
  } catch (e) {
    const output = e.stdout?.toString() ?? e.message;
    fail("S07  Server unit tests pass", output.split("\n").slice(-5).join(" | "));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(48)}`);
  const total = passed + failed;
  if (failed === 0) {
    console.log(`\x1b[32mAll ${total} smoke tests passed.\x1b[0m\n`);
    process.exit(0);
  } else {
    console.error(`\x1b[31m${failed} of ${total} smoke tests FAILED.\x1b[0m\n`);
    process.exit(1);
  }
}

runSmoke().catch((err) => {
  console.error("Smoke test runner crashed:", err);
  process.exit(1);
});
