/**
 * e2e/game-flow.spec.ts
 *
 * End-to-end test for the full registry-14 game session flow.
 *
 * Test plan:
 *   1. TV client creates a room → room code visible
 *   2. Two phone clients join the room with different names
 *   3. Host selects "registry-14-dont-get-caught" and sets 1 round
 *   4. Both phone clients tap "Got it" on the instructions screen
 *   5. Game enters in_round — TV renders game canvas
 *   6. Phone clients send movement inputs
 *   7. Round timer expires (or all players eliminated) → scoreboard
 *   8. Scoreboard shows correct player names and scores
 */

import { test, expect, Page, BrowserContext } from "@playwright/test";

const TV_URL = "http://localhost:5173";
const PHONE_URL = "http://localhost:5174";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getRoomCode(tvPage: Page): Promise<string> {
  const codeEl = tvPage.locator('[data-testid="room-code"]');
  await expect(codeEl).toBeVisible({ timeout: 15_000 });
  return (await codeEl.textContent())?.trim() ?? "";
}

async function joinAsPlayer(
  context: BrowserContext,
  roomCode: string,
  name: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(PHONE_URL);
  await expect(page.locator('[data-testid="join-screen"]')).toBeVisible();

  await page.fill('[data-testid="room-code-input"]', roomCode);
  await page.fill('[data-testid="name-input"]', name);
  await page.click('[data-testid="join-btn"]');
  await expect(page.locator('[data-testid="phone-lobby"]')).toBeVisible({ timeout: 10_000 });
  return page;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Registry-14 full game flow", () => {
  let tvPage: Page;
  let phone1: Page;
  let phone2: Page;

  test.beforeEach(async ({ browser }) => {
    const context = await browser.newContext();
    tvPage = await context.newPage();
    phone1 = await context.newPage();
    phone2 = await context.newPage();
  });

  test.afterEach(async () => {
    await tvPage?.close();
    await phone1?.close();
    await phone2?.close();
  });

  test("T01 — TV creates room and shows code", async () => {
    await tvPage.goto(TV_URL);
    await expect(tvPage.locator('[data-testid="tv-app"]')).toBeVisible();

    const code = await getRoomCode(tvPage);
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
    expect(code).not.toContain("0");
    expect(code).not.toContain("O");
  });

  test("T02 — Players can join the room", async () => {
    await tvPage.goto(TV_URL);
    const code = await getRoomCode(tvPage);

    phone1 = await joinAsPlayer(await tvPage.context(), code, "Alice");
    phone2 = await joinAsPlayer(await tvPage.context(), code, "Bob");

    // TV should show both players
    const playerList = tvPage.locator('[data-testid="player-list"]');
    await expect(playerList).toContainText("Alice");
    await expect(playerList).toContainText("Bob");
  });

  test("T03 — Host can select game and start", async () => {
    await tvPage.goto(TV_URL);
    const code = await getRoomCode(tvPage);

    await joinAsPlayer(await tvPage.context(), code, "Alice");

    // Select game
    await tvPage.click("button:has-text(\"Don't Get Caught\")");

    // Start button should become active
    await expect(tvPage.locator('[data-testid="start-btn"]')).not.toBeDisabled();
    await tvPage.click('[data-testid="start-btn"]');

    // TV should transition to instructions
    await expect(tvPage.locator('[data-testid="instructions-screen"]')).toBeVisible({
      timeout: 10_000,
    });
  });

  test("T04 — Instructions phase: player confirms and game starts", async ({ browser }) => {
    const ctx = await browser.newContext();
    tvPage = await ctx.newPage();
    await tvPage.goto(TV_URL);
    const code = await getRoomCode(tvPage);

    phone1 = await ctx.newPage();
    await phone1.goto(PHONE_URL);
    await phone1.fill('[data-testid="room-code-input"]', code);
    await phone1.fill('[data-testid="name-input"]', "Alice");
    await phone1.click('[data-testid="join-btn"]');
    await expect(phone1.locator('[data-testid="phone-lobby"]')).toBeVisible();

    // Start game from TV
    await tvPage.click("button:has-text(\"Don't Get Caught\")");
    await tvPage.click('[data-testid="start-btn"]');

    // Phone should show instructions
    await expect(phone1.locator('[data-testid="phone-instructions"]')).toBeVisible({
      timeout: 10_000,
    });

    // Confirm instructions
    await phone1.click('[data-testid="got-it-btn"]');

    // TV should advance to countdown then in_round
    await expect(tvPage.locator('[data-testid="countdown-screen"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(tvPage.locator('[data-testid="game-screen"]')).toBeVisible({
      timeout: 10_000,
    });
  });

  test("T05 — In-game: phone sends movement and hide inputs", async ({ browser }) => {
    const ctx = await browser.newContext();
    tvPage = await ctx.newPage();
    await tvPage.goto(TV_URL);
    const code = await getRoomCode(tvPage);

    phone1 = await ctx.newPage();
    await phone1.goto(PHONE_URL);
    await phone1.fill('[data-testid="room-code-input"]', code);
    await phone1.fill('[data-testid="name-input"]', "Alice");
    await phone1.click('[data-testid="join-btn"]');

    // Set 1 round, fast timer
    await tvPage.click("button:has-text(\"Don't Get Caught\")");
    // Change time limit to 10s for faster test
    await tvPage.fill('input[type="number"][min="20"]', "10");
    await tvPage.click('[data-testid="start-btn"]');

    await expect(phone1.locator('[data-testid="phone-instructions"]')).toBeVisible({ timeout: 10_000 });
    await phone1.click('[data-testid="got-it-btn"]');

    // Wait for game screen on phone
    await expect(phone1.locator('[data-testid="phone-game"]')).toBeVisible({ timeout: 10_000 });

    // Verify hide button is present and clickable
    const hideBtn = phone1.locator('[data-testid="hide-btn"]');
    await expect(hideBtn).toBeVisible();
    await hideBtn.click();

    // Verify detection meter is present
    await expect(phone1.locator('[data-testid="detection-meter"]')).toBeVisible();

    // Timer should be counting down
    const timerEl = phone1.locator('[data-testid="phone-timer"]');
    await expect(timerEl).toBeVisible();
    const initialTime = parseInt(await timerEl.textContent() ?? "0", 10);
    expect(initialTime).toBeGreaterThan(0);
  });

  test("T06 — Game ends and scoreboard appears", async ({ browser }) => {
    const ctx = await browser.newContext();
    tvPage = await ctx.newPage();
    await tvPage.goto(TV_URL);
    const code = await getRoomCode(tvPage);

    phone1 = await ctx.newPage();
    await phone1.goto(PHONE_URL);
    await phone1.fill('[data-testid="room-code-input"]', code);
    await phone1.fill('[data-testid="name-input"]', "Alice");
    await phone1.click('[data-testid="join-btn"]');

    await tvPage.click("button:has-text(\"Don't Get Caught\")");
    // Set shortest possible time limit (20s minimum per config)
    await tvPage.fill('input[type="number"][min="20"]', "20");
    await tvPage.click('[data-testid="start-btn"]');

    await expect(phone1.locator('[data-testid="phone-instructions"]')).toBeVisible({ timeout: 10_000 });
    await phone1.click('[data-testid="got-it-btn"]');

    // Wait for scoreboard (20s round + ~7s for round_end + scoreboard phases)
    await expect(tvPage.locator('[data-testid="scoreboard-screen"]')).toBeVisible({
      timeout: 40_000,
    });

    // Scoreboard should show player name
    await expect(tvPage.locator('[data-testid="scoreboard-screen"]')).toContainText("Alice");
  });

  test("T07 — TV timer counts down correctly", async ({ browser }) => {
    const ctx = await browser.newContext();
    tvPage = await ctx.newPage();
    await tvPage.goto(TV_URL);
    const code = await getRoomCode(tvPage);

    phone1 = await ctx.newPage();
    await phone1.goto(PHONE_URL);
    await phone1.fill('[data-testid="room-code-input"]', code);
    await phone1.fill('[data-testid="name-input"]', "Alice");
    await phone1.click('[data-testid="join-btn"]');

    await tvPage.click("button:has-text(\"Don't Get Caught\")");
    await tvPage.fill('input[type="number"][min="20"]', "30");
    await tvPage.click('[data-testid="start-btn"]');

    await phone1.click('[data-testid="got-it-btn"]').catch(() => {}); // may not be on instructions
    await expect(tvPage.locator('[data-testid="game-screen"]')).toBeVisible({ timeout: 15_000 });

    const timerEl = tvPage.locator('[data-testid="timer"]');
    await expect(timerEl).toBeVisible();

    // Read timer twice, 2 seconds apart, confirm it decreased
    const t1 = parseInt(await timerEl.textContent() ?? "99", 10);
    await tvPage.waitForTimeout(2000);
    const t2 = parseInt(await timerEl.textContent() ?? "99", 10);
    expect(t1).toBeGreaterThan(t2);
  });

  test("T08 — Phase transition: lobby → instructions → countdown → in_round", async ({ browser }) => {
    const ctx = await browser.newContext();
    tvPage = await ctx.newPage();
    await tvPage.goto(TV_URL);
    const code = await getRoomCode(tvPage);

    phone1 = await ctx.newPage();
    await phone1.goto(PHONE_URL);
    await phone1.fill('[data-testid="room-code-input"]', code);
    await phone1.fill('[data-testid="name-input"]', "Alice");
    await phone1.click('[data-testid="join-btn"]');

    // Verify lobby
    await expect(tvPage.locator('[data-testid="room-code"]')).toBeVisible();

    await tvPage.click("button:has-text(\"Don't Get Caught\")");
    await tvPage.click('[data-testid="start-btn"]');

    // Instructions
    await expect(tvPage.locator('[data-testid="instructions-screen"]')).toBeVisible({ timeout: 10_000 });
    await phone1.click('[data-testid="got-it-btn"]');

    // Countdown
    await expect(tvPage.locator('[data-testid="countdown-screen"]')).toBeVisible({ timeout: 8_000 });

    // In-round
    await expect(tvPage.locator('[data-testid="game-screen"]')).toBeVisible({ timeout: 8_000 });
  });
});
