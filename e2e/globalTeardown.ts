/**
 * e2e/globalTeardown.ts
 * Kills all child processes started in globalSetup.
 */
import type { ChildProcess } from "child_process";

export default async function globalTeardown() {
  const procs = (globalThis as Record<string, unknown>).__e2eProcesses as ChildProcess[] | undefined;
  if (!procs) return;
  for (const p of procs) {
    try {
      p.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
}
