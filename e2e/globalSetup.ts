/**
 * e2e/globalSetup.ts
 *
 * Starts the Colyseus server and the unified client Vite dev server before
 * Playwright test suites run.  Returns a teardown function that kills all
 * processes.
 *
 * Processes are started with stdio: "pipe" so CI logs aren't flooded.
 * Each process is waited on using a "ready" signal in stdout.
 */

import { ChildProcess, spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";

import fs from "fs";

const processes: ChildProcess[] = [];

function waitForOutput(proc: ChildProcess, token: string, timeoutMs = 30_000): Promise<void> {
  const logStream = fs.createWriteStream("e2e-server.log", { flags: "a" });
  proc.stdout?.pipe(logStream);
  proc.stderr?.pipe(logStream);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for "${token}"`)), timeoutMs);
    proc.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes(token)) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes(token)) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

export default async function globalSetup() {
  // 1. Start Colyseus server
  const server = spawn("npm", ["run", "dev:server"], {
    stdio: "pipe",
    shell: true,
    env: { ...process.env, PORT: "2567" },
  });
  processes.push(server);
  await waitForOutput(server, "listening on");

  // 2. Start unified client Vite dev server
  const client = spawn("npm", ["run", "dev:client"], {
    stdio: "pipe",
    shell: true,
    env: { ...process.env, VITE_SERVER_URL: "ws://localhost:2567" },
  });
  processes.push(client);
  await waitForOutput(client, "Local");

  // Brief pause for sockets to stabilise
  await sleep(500);

  // Stash for teardown
  (globalThis as Record<string, unknown>).__e2eProcesses = processes;
}
