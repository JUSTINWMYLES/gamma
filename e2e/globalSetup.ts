/**
 * e2e/globalSetup.ts
 *
 * Starts the Colyseus server and both Vite dev servers before Playwright
 * test suites run.  Returns a teardown function that kills all processes.
 *
 * Processes are started with stdio: "pipe" so CI logs aren't flooded.
 * Each process is waited on using a "ready" signal in stdout.
 */

import { ChildProcess, spawn } from "child_process";
import { setTimeout as sleep } from "timers/promises";

const processes: ChildProcess[] = [];

function waitForOutput(proc: ChildProcess, token: string, timeoutMs = 30_000): Promise<void> {
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

  // 2. Start TV Vite dev server
  const tv = spawn("npm", ["run", "dev:tv"], {
    stdio: "pipe",
    shell: true,
    env: { ...process.env, VITE_SERVER_URL: "ws://localhost:2567" },
  });
  processes.push(tv);
  await waitForOutput(tv, "Local");

  // 3. Start Phone Vite dev server
  const phone = spawn("npm", ["run", "dev:phone"], {
    stdio: "pipe",
    shell: true,
    env: { ...process.env, VITE_SERVER_URL: "ws://localhost:2567" },
  });
  processes.push(phone);
  await waitForOutput(phone, "Local");

  // Brief pause for sockets to stabilise
  await sleep(500);

  // Stash for teardown
  (globalThis as Record<string, unknown>).__e2eProcesses = processes;
}
