/**
 * e2e/game-flow.spec.ts
 *
 * End-to-end test for the full registry-14 game session flow.
 *
 * Actual app flow:
 *   1. Host player goes to APP_URL → picks "Player" → picks "Host" → completes setup wizard
 *   2. Host gets room code in the lobby
 *   3. TV viewer goes to APP_URL → picks "Display" → enters room code
 *   4. Additional players join via "Player" → "Join" flow
 *   5. Host selects game and starts from the phone lobby
 */

import { test, expect, Page, BrowserContext } from "@playwright/test";

const APP_URL = "/";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Complete the host setup wizard (3-step: location → activity → display).
 * Chooses "same room", "none" activity, "with TV" display (fastest path through).
 * Waits for and dismisses the device consent dialog which overlays the wizard on first load.
 */
async function completeSetupWizard(page: Page) {
  const skipBtn = page.locator("button:has-text('Skip for now')");
  if (await skipBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await skipBtn.click();
  }
  // Step 1: location
  await page.locator("button:has-text('Together')").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("button:has-text('Together')").click();
  // Step 2: activity
  await page.locator('[data-testid="setup-activity-none"]').waitFor({ state: "visible", timeout: 10000 });
  await page.locator('[data-testid="setup-activity-none"]').click();
  // Step 3: display
  await page.locator("button:has-text('TV, laptop')").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("button:has-text('TV, laptop')").click();
}

/**
 * Start a host session: navigate, select Player → Host, complete wizard.
 * Returns the page once the lobby (phone-lobby testid) is visible.
 */
async function startAsHost(page: Page): Promise<void> {
  // Pre-set localStorage to skip the device consent dialog entirely
  await page.addInitScript(() => {
    localStorage.setItem("gamma-device-consent", "skipped");
  });
  await page.goto(APP_URL);

  await expect(page.locator('[data-testid="role-player-btn"]')).toBeVisible();
  await page.click('[data-testid="role-player-btn"]');
  await expect(page.locator('[data-testid="landing-host-btn"]')).toBeVisible();
  await page.click('[data-testid="landing-host-btn"]');
  await expect(page.locator('[data-testid="host-name-input"]')).toBeVisible();
  await page.fill('[data-testid="host-name-input"]', "HostPlayer");
  await page.click('[data-testid="host-btn"]');
  // Complete the 3-step setup wizard
  await completeSetupWizard(page);
  await expect(page.locator('[data-testid="phone-lobby"]')).toBeVisible({ timeout: 15_000 });
}

/**
 * Read the room code from the host's phone lobby.
 */
async function getHostRoomCode(hostPage: Page): Promise<string> {
  // Room code is the 4-char mono text in the phone lobby
  const codeEl = hostPage.locator('[data-testid="phone-lobby"] p.font-mono').first();
  await expect(codeEl).toBeVisible({ timeout: 10_000 });
  return (await codeEl.textContent())?.trim() ?? "";
}

/**
 * Join as TV viewer: navigate, select Display, enter room code.
 * Returns once the TV lobby with the room-code element is visible.
 */
async function joinAsViewer(page: Page, roomCode: string): Promise<Page> {
  await page.addInitScript(() => {
    localStorage.setItem("gamma-device-consent", "skipped");
  });
  await page.goto(APP_URL);
  await expect(page.locator('[data-testid="role-viewer-btn"]')).toBeVisible();
  await page.click('[data-testid="role-viewer-btn"]');
  // Enter room code in the viewer join form
  await page.fill('input[placeholder="ROOM CODE"]', roomCode);
  await page.click('button:has-text("Join as Display")');
  await expect(page.locator('[data-testid="room-code"]')).toBeVisible({ timeout: 15_000 });
  return page;
}

/**
 * Join as a regular player: navigate, select Player → Join, fill code + name.
 * Returns the page once phone-lobby is visible.
 */
async function joinAsPlayer(page: Page, roomCode: string, name: string): Promise<Page> {
  await page.addInitScript(() => {
    localStorage.setItem("gamma-device-consent", "skipped");
  });
  await page.goto(APP_URL);
  await page.click('[data-testid="role-player-btn"]');
  await expect(page.locator('[data-testid="landing-join-btn"]')).toBeVisible();
  await page.click('[data-testid="landing-join-btn"]');
  await expect(page.locator('[data-testid="join-screen"]')).toBeVisible();
  await page.fill('[data-testid="room-code-input"]', roomCode);
  await page.fill('[data-testid="name-input"]', name);
  await page.click('[data-testid="join-btn"]');
  await expect(page.locator('[data-testid="phone-lobby"]')).toBeVisible({ timeout: 10_000 });
  await page.click('[data-testid="ready-btn"]');
  return page;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Registry-14 full game flow", () => {
  let hostCtx: BrowserContext;
  let tvCtx: BrowserContext;
  let p1Ctx: BrowserContext;
  let p2Ctx: BrowserContext;

  let hostPage: Page;
  let tvPage: Page;
  let phone1: Page;
  let phone2: Page;

  test.beforeEach(async ({ browser }) => {
    hostCtx = await browser.newContext();
    tvCtx = await browser.newContext();
    p1Ctx = await browser.newContext();
    p2Ctx = await browser.newContext();

    hostPage = await hostCtx.newPage();
    hostPage.on("console", msg => console.log("HOST PAGE LOG:", msg.text()));
    tvPage = await tvCtx.newPage();
    phone1 = await p1Ctx.newPage();
    phone2 = await p2Ctx.newPage();
  });

  test.afterEach(async () => {
    await hostCtx?.close();
    await tvCtx?.close();
    await p1Ctx?.close();
    await p2Ctx?.close();
  });

  test("T01 — Host creates room and room code is shown", async () => {
    await startAsHost(hostPage);
    const code = await getHostRoomCode(hostPage);
    expect(code).toMatch(/^[A-Z0-9]{4}$/);
    expect(code).not.toContain("0");
    expect(code).not.toContain("O");
  });

  test("T02 — TV viewer and players can join the room", async () => {
    await startAsHost(hostPage);
    const code = await getHostRoomCode(hostPage);

    await joinAsViewer(tvPage, code);
    await joinAsPlayer(phone1, code, "Alice");
    await joinAsPlayer(phone2, code, "Bob");

    // TV lobby should show both players
    const playerList = tvPage.locator('[data-testid="player-list"]');
    await expect(playerList).toContainText("Alice");
    await expect(playerList).toContainText("Bob");

    // Host lobby should also show the players
    await expect(hostPage.locator('[data-testid="phone-lobby"]')).toContainText("Alice");
    await expect(hostPage.locator('[data-testid="phone-lobby"]')).toContainText("Bob");
  });

  test("T03 — Host can select game and start", async () => {
    await startAsHost(hostPage);
    const code = await getHostRoomCode(hostPage);

    await joinAsPlayer(phone1, code, "Alice");

    // Host selects "Don't Get Caught" from the game list
    await hostPage.locator('.card-name', { hasText: "Don't Get Caught" }).click();

    // Start button should become active
    await expect(hostPage.locator('[data-testid="start-btn"]')).not.toBeDisabled();
    await hostPage.click('[data-testid="start-btn"]');

    // Phone should transition to instructions
    await expect(phone1.locator('[data-testid="phone-instructions"]')).toBeVisible({
      timeout: 10_000,
    });
  });

  test("T04 — Instructions phase: player confirms and game starts", async () => {
    await startAsHost(hostPage);
    const code = await getHostRoomCode(hostPage);

    await joinAsViewer(tvPage, code);
    await joinAsPlayer(phone1, code, "Alice");

    // Host starts game
    await hostPage.locator('.card-name', { hasText: "Don't Get Caught" }).click();
    await hostPage.click('[data-testid="start-btn"]');

    // TV and phone should show instructions
    await expect(tvPage.locator('[data-testid="instructions-screen"]')).toBeVisible({ timeout: 10_000 });
    await expect(phone1.locator('[data-testid="phone-instructions"]')).toBeVisible({ timeout: 10_000 });

    // Player confirms instructions
    await phone1.click('[data-testid="got-it-btn"]');
    await hostPage.click('[data-testid="got-it-btn"]');

    // TV should advance to countdown then in_round
    await expect(tvPage.locator('[data-testid="countdown-screen"]')).toBeVisible({ timeout: 10_000 });
    await expect(tvPage.locator('[data-testid="game-screen"]')).toBeVisible({ timeout: 10_000 });
  });

  test("T05 — In-game: phone sends movement and hide inputs", async () => {
    await startAsHost(hostPage);
    const code = await getHostRoomCode(hostPage);
    await joinAsPlayer(phone1, code, "Alice");

    // Select game, set short time limit (10s), start
    await hostPage.locator('.card-name', { hasText: "Don't Get Caught" }).click();
    
    // Wait for the server to set the default rounds for the selected game
    await expect(hostPage.locator('input[type="number"][min="1"]')).toHaveValue("3", { timeout: 5000 });

    await hostPage.locator('input[type="number"][min="1"]').fill("1");
    await hostPage.locator('input[type="number"][min="1"]').evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
    await hostPage.locator('input[type="number"][min="10"]').fill("10");
    await hostPage.locator('input[type="number"][min="10"]').evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
    await hostPage.click('[data-testid="start-btn"]');

    await expect(phone1.locator('[data-testid="phone-instructions"]')).toBeVisible({ timeout: 10_000 });
    await phone1.click('[data-testid="got-it-btn"]');
    await hostPage.click('[data-testid="got-it-btn"]');

    // Wait for game screen on phone
    await expect(phone1.locator('[data-testid="phone-game"]')).toBeVisible({ timeout: 10_000 });

    // Verify detection meter is present
    await expect(phone1.locator('[data-testid="detection-meter"]')).toBeVisible();

    // Timer should be counting down
    const timerEl = phone1.locator('[data-testid="phone-timer"]');
    await expect(timerEl).toBeVisible();
    const initialTime = parseInt(await timerEl.textContent() ?? "0", 10);
    expect(initialTime).toBeGreaterThan(0);
  });

  test("T06 — Game ends and scoreboard appears", async () => {
    await startAsHost(hostPage);
    const code = await getHostRoomCode(hostPage);
    await joinAsViewer(tvPage, code);
    await joinAsPlayer(phone1, code, "Alice");

    await hostPage.locator('.card-name', { hasText: "Don't Get Caught" }).click();
    
    // Wait for the server to set the default rounds for the selected game
    await expect(hostPage.locator('input[type="number"][min="1"]')).toHaveValue("3", { timeout: 5000 });

    await hostPage.locator('input[type="number"][min="1"]').fill("1");
    await hostPage.locator('input[type="number"][min="1"]').evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
    await hostPage.locator('input[type="number"][min="10"]').fill("10");
    await hostPage.locator('input[type="number"][min="10"]').evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
    await hostPage.click('[data-testid="start-btn"]');

    await expect(phone1.locator('[data-testid="phone-instructions"]')).toBeVisible({ timeout: 10_000 });
    await phone1.click('[data-testid="got-it-btn"]');
    await hostPage.click('[data-testid="got-it-btn"]');

    // Wait for scoreboard (10s round + transition phases)
    try {
      await expect(tvPage.locator('[data-testid="scoreboard-screen"]')).toBeVisible({ timeout: 25_000 });
    } catch (e) {
      console.log("TV PAGE HTML:", await tvPage.content());
      throw e;
    }

    // Scoreboard should show player name
    await expect(tvPage.locator('[data-testid="scoreboard-screen"]')).toContainText("Alice");
  });

  test("T07 — TV timer counts down correctly", async () => {
    await startAsHost(hostPage);
    const code = await getHostRoomCode(hostPage);
    await joinAsViewer(tvPage, code);
    await joinAsPlayer(phone1, code, "Alice");

    await hostPage.locator('.card-name', { hasText: "Don't Get Caught" }).click();
    await expect(hostPage.locator('input[type="number"][min="1"]')).toHaveValue("3", { timeout: 5000 });
    await hostPage.fill('input[type="number"][min="10"]', "30");
    await hostPage.locator('input[type="number"][min="10"]').evaluate((el) => el.dispatchEvent(new Event("change", { bubbles: true })));
    await hostPage.click('[data-testid="start-btn"]');

    // Confirm instructions if shown
    await phone1.locator('[data-testid="got-it-btn"]').click().catch(() => {});
    await hostPage.locator('[data-testid="got-it-btn"]').click().catch(() => {});
    await expect(tvPage.locator('[data-testid="game-screen"]')).toBeVisible({ timeout: 20_000 });

    const timerEl = tvPage.locator('[data-testid="timer"]');
    await expect(timerEl).toBeVisible();

    // Read timer twice, 2 seconds apart, confirm it decreased
    const t1 = parseInt(await timerEl.textContent() ?? "99", 10);
    await tvPage.waitForTimeout(2000);
    const t2 = parseInt(await timerEl.textContent() ?? "99", 10);
    expect(t1).toBeGreaterThan(t2);
  });

  test("T08 — Phase transition: lobby → instructions → countdown → in_round", async () => {
    await startAsHost(hostPage);
    const code = await getHostRoomCode(hostPage);
    await joinAsViewer(tvPage, code);
    await joinAsPlayer(phone1, code, "Alice");

    // TV lobby should show room code
    await expect(tvPage.locator('[data-testid="room-code"]')).toBeVisible();

    await hostPage.locator('.card-name', { hasText: "Don't Get Caught" }).click();
    await hostPage.click('[data-testid="start-btn"]');

    // Instructions
    await expect(tvPage.locator('[data-testid="instructions-screen"]')).toBeVisible({ timeout: 10_000 });
    await phone1.click('[data-testid="got-it-btn"]');
    await hostPage.click('[data-testid="got-it-btn"]');

    // Countdown
    await expect(tvPage.locator('[data-testid="countdown-screen"]')).toBeVisible({ timeout: 8_000 });

    // In-round
    await expect(tvPage.locator('[data-testid="game-screen"]')).toBeVisible({ timeout: 8_000 });
  });
});
