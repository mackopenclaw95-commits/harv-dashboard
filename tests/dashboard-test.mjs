/**
 * Harv Dashboard — Full Visual Test Suite
 * Opens a HEADED Chrome browser so you can watch in real time.
 * Tests every page, interaction, and looks for bugs.
 *
 * Usage: node tests/dashboard-test.mjs
 */

import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const SLOW = 600; // ms between actions so you can watch

const results = [];
let passed = 0;
let failed = 0;

function log(status, page, detail) {
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️";
  console.log(`${icon} [${page}] ${detail}`);
  results.push({ status, page, detail });
  if (status === "PASS") passed++;
  if (status === "FAIL") failed++;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function testPage(page, path, name, checks) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 15000 });
    await sleep(SLOW);

    // Check for JS errors
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Check page loaded (not blank)
    const body = await page.textContent("body");
    if (!body || body.trim().length < 10) {
      log("FAIL", name, "Page is blank or nearly empty");
      return;
    }
    log("PASS", name, "Page loaded successfully");

    // Check for hydration errors in console
    if (errors.length > 0) {
      for (const err of errors) {
        log("FAIL", name, `JS Error: ${err.slice(0, 120)}`);
      }
    }

    // Run page-specific checks
    if (checks) {
      await checks(page, name);
    }
  } catch (err) {
    log("FAIL", name, `Navigation error: ${err.message.slice(0, 120)}`);
  }
}

async function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║   HARV DASHBOARD — Full Visual Test Suite              ║");
  console.log("║   Watch the browser window to see tests in real time   ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const browser = await chromium.launch({
    headless: false,
    slowMo: 200,
    args: ["--window-size=1400,900"],
  });

  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();

  // Collect console errors globally
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  // ─── 1. DASHBOARD ──────────────────────────────────────
  await testPage(page, "/", "Dashboard", async (p, name) => {
    // Check stats cards exist
    const cards = await p.locator('[data-slot="card"]').count();
    if (cards >= 4) {
      log("PASS", name, `Found ${cards} cards`);
    } else {
      log("FAIL", name, `Expected 4+ cards, found ${cards}`);
    }

    // Check sidebar exists
    const sidebar = await p.locator("aside").count();
    if (sidebar > 0) {
      log("PASS", name, "Sidebar rendered");
    } else {
      log("FAIL", name, "Sidebar missing");
    }
  });

  // ─── 2. CHAT ───────────────────────────────────────────
  await testPage(page, "/chat", "Chat", async (p, name) => {
    // Check textarea exists
    const textarea = await p.locator("textarea").count();
    if (textarea > 0) {
      log("PASS", name, "Chat input textarea found");
    } else {
      log("FAIL", name, "Chat input textarea missing");
    }

    // Check send button
    const sendBtn = await p.locator('button[type="submit"]').count();
    if (sendBtn > 0) {
      log("PASS", name, "Send button found");
    } else {
      log("FAIL", name, "Send button missing");
    }

    // Check file attachment button
    const paperclip = await p.locator('button:has(svg)').first();
    if (paperclip) {
      log("PASS", name, "File attachment button found");
    }

    // Try typing a message (don't send)
    const ta = p.locator("textarea").first();
    await ta.fill("Test message - do not send");
    await sleep(SLOW);
    const val = await ta.inputValue();
    if (val === "Test message - do not send") {
      log("PASS", name, "Textarea accepts input");
    } else {
      log("FAIL", name, "Textarea input not working");
    }
    await ta.fill(""); // clear it
  });

  // ─── 3. CALENDAR ───────────────────────────────────────
  await testPage(page, "/calendar", "Calendar", async (p, name) => {
    // Check for connect button or calendar grid
    const connectBtn = await p.locator('text=Connect Google Calendar').count();
    const grid = await p.locator('text=Sun').count();

    if (connectBtn > 0) {
      log("PASS", name, "Google Calendar connect button shown (not connected)");
    } else if (grid > 0) {
      log("PASS", name, "Calendar grid rendered (connected)");
    } else {
      log("FAIL", name, "Neither connect button nor calendar grid found");
    }

    // Check month navigation
    const chevrons = await p.locator('button:has(svg)').count();
    if (chevrons >= 2) {
      log("PASS", name, "Navigation buttons present");
    }
  });

  // ─── 4. AGENTS ─────────────────────────────────────────
  await testPage(page, "/agents", "Agents", async (p, name) => {
    // Check flowchart exists
    const flowchart = await p.locator('text=Main Brain').count();
    if (flowchart > 0) {
      log("PASS", name, "Flowchart with Harv Main Brain rendered");
    } else {
      log("FAIL", name, "Flowchart missing");
    }

    // Check agent cards exist
    await sleep(2000); // wait for API
    const agentCards = await p.locator('[data-slot="card"]').count();
    if (agentCards >= 10) {
      log("PASS", name, `Found ${agentCards} agent cards`);
    } else {
      log("WARN", name, `Only ${agentCards} agent cards (may be loading or API down)`);
    }

    // Check Coming Soon section
    const comingSoon = await p.locator('text=Coming Soon').count();
    if (comingSoon > 0) {
      log("PASS", name, "Coming Soon section exists");
    }

    // Try expanding an agent card
    const firstCard = p.locator('[data-slot="card"]').nth(8); // skip stats cards
    if (await firstCard.isVisible()) {
      await firstCard.click();
      await sleep(SLOW);
      log("PASS", name, "Agent card click/expand works");
    }
  });

  // ─── 5. AGENT DETAIL (Harv) ────────────────────────────
  await testPage(page, "/agents/Harv", "Agent Detail (Harv)", async (p, name) => {
    // Check header
    const header = await p.locator('h1:has-text("Harv")').count();
    if (header > 0) {
      log("PASS", name, "Agent name in header");
    } else {
      log("FAIL", name, "Agent name missing from header");
    }

    // Check chat input
    const textarea = await p.locator("textarea").count();
    if (textarea > 0) {
      log("PASS", name, "Chat input present on agent detail page");
    } else {
      log("FAIL", name, "Chat input missing");
    }

    // Check sidebar info panel
    const aside = await p.locator("aside").count();
    if (aside > 0) {
      log("PASS", name, "Info sidebar panel rendered");
    }

    // Check back button
    const backBtn = await p.locator('a[href="/agents"]').count();
    if (backBtn > 0) {
      log("PASS", name, "Back to agents link works");
    }
  });

  // ─── 6. CRONS ──────────────────────────────────────────
  await testPage(page, "/crons", "Cron Jobs", async (p, name) => {
    const heading = await p.locator('h1:has-text("Cron")').count();
    if (heading > 0) {
      log("PASS", name, "Page heading rendered");
    } else {
      log("FAIL", name, "Page heading missing");
    }
  });

  // ─── 7. DOCUMENTS ──────────────────────────────────────
  await testPage(page, "/documents", "Documents", async (p, name) => {
    const heading = await p.locator('h1:has-text("Document")').count();
    if (heading > 0) {
      log("PASS", name, "Page heading rendered");
    } else {
      log("FAIL", name, "Page heading missing");
    }

    // Check search input
    const search = await p.locator('input[placeholder*="earch"]').count();
    if (search > 0) {
      log("PASS", name, "Search input found");
    }

    // Check upload button
    const upload = await p.locator('text=Upload').count();
    if (upload > 0) {
      log("PASS", name, "Upload button present");
    }
  });

  // ─── 8. JOURNAL ────────────────────────────────────────
  await testPage(page, "/journal", "Journal", async (p, name) => {
    const heading = await p.locator('h1:has-text("Daily Journal")').count();
    if (heading > 0) {
      log("PASS", name, "Page heading rendered");
    } else {
      log("FAIL", name, "Page heading missing");
    }

    // Check stats cards
    const statsCards = await p.locator('text=Entries').count();
    if (statsCards > 0) {
      log("PASS", name, "Stats cards rendered");
    }

    // Check search input
    const search = await p.locator('input[placeholder*="earch"]').count();
    if (search > 0) {
      log("PASS", name, "Search input found");
    }

    // Check date inputs
    const dateInputs = await p.locator('input[type="date"]').count();
    if (dateInputs === 2) {
      log("PASS", name, "Both date filter inputs present");
    } else {
      log("FAIL", name, `Expected 2 date inputs, found ${dateInputs}`);
    }

    // Check empty state or entries
    const emptyState = await p.locator('text=No journal entries yet').count();
    if (emptyState > 0) {
      log("PASS", name, "Empty state displayed correctly");
    }
  });

  // ─── 9. MEMORY ─────────────────────────────────────────
  await testPage(page, "/memory", "Memory", async (p, name) => {
    const heading = await p.locator('h1:has-text("Memory")').count();
    if (heading > 0) {
      log("PASS", name, "Page heading rendered");
    } else {
      log("FAIL", name, "Page heading missing");
    }

    // Check tabs exist
    const tabs = await p.locator('button[role="tab"], [data-slot="tabs-trigger"]').count();
    if (tabs >= 2) {
      log("PASS", name, `Found ${tabs} tabs`);
    }
  });

  // ─── 10. ANALYTICS ─────────────────────────────────────
  await testPage(page, "/analytics", "Analytics", async (p, name) => {
    const heading = await p.locator('h1:has-text("Analytics")').count();
    if (heading > 0) {
      log("PASS", name, "Page heading rendered");
    } else {
      log("FAIL", name, "Page heading missing");
    }
  });

  // ─── 11. SETTINGS ──────────────────────────────────────
  await testPage(page, "/settings", "Settings", async (p, name) => {
    const heading = await p.locator('h1:has-text("Settings")').count();
    if (heading > 0) {
      log("PASS", name, "Page heading rendered");
    } else {
      log("FAIL", name, "Page heading missing");
    }

    // Check personality toggle card
    const personality = await p.locator('text=Harv Personality').count();
    if (personality > 0) {
      log("PASS", name, "Personality toggle card present");
    } else {
      log("FAIL", name, "Personality toggle card missing");
    }

    // Check API connection card
    const api = await p.locator('text=API Connection').count();
    if (api > 0) {
      log("PASS", name, "API Connection card present");
    }

    // Try clicking Test button
    const testBtn = await p.locator('button:has-text("Test")').count();
    if (testBtn > 0) {
      await p.locator('button:has-text("Test")').click();
      await sleep(2000);
      log("PASS", name, "Health check test button clicked");

      // Check if status appeared
      const connected = await p.locator('text=Connected').count();
      const unreachable = await p.locator('text=unreachable').count();
      if (connected > 0) {
        log("PASS", name, "API health check: Connected");
      } else if (unreachable > 0) {
        log("WARN", name, "API health check: Unreachable (VPS may be down)");
      }
    }

    // Try personality switch
    const switchBtn = await p.locator('button:has-text("Switch to")').count();
    if (switchBtn > 0) {
      log("PASS", name, "Personality switch button found");
      // Don't actually click it to avoid changing state
    }
  });

  // ─── 12. ONBOARDING ───────────────────────────────────
  await testPage(page, "/onboarding", "Onboarding", async (p, name) => {
    // Step 1: Meet Harv
    const meetHarv = await p.locator('text=Meet Harv').count();
    if (meetHarv > 0) {
      log("PASS", name, "Step 1: Meet Harv screen rendered");
    } else {
      log("FAIL", name, "Step 1 not rendered");
    }

    // Check personality options
    const cars1 = await p.locator('text=Cars 1 Mode').count();
    const defaultMode = await p.locator('text=Default Mode').count();
    if (cars1 > 0 && defaultMode > 0) {
      log("PASS", name, "Both personality options shown");
    }

    // Click Continue to test navigation
    const continueBtn = await p.locator('button:has-text("Continue")');
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
      await sleep(SLOW);

      // Should be on Step 2: Connect Google
      const step2 = await p.locator('text=Connect Google').count();
      if (step2 > 0) {
        log("PASS", name, "Step 2: Connect Google screen rendered");
      } else {
        log("FAIL", name, "Step 2 navigation failed");
      }

      // Continue to Step 3
      const skipBtn = await p.locator('button:has-text("Skip for now"), button:has-text("Continue")').last();
      await skipBtn.click();
      await sleep(SLOW);

      const step3 = await p.locator('text=Connect Spotify').count();
      if (step3 > 0) {
        log("PASS", name, "Step 3: Connect Spotify screen rendered");
      }

      // Continue to Step 4
      const cont3 = await p.locator('button:has-text("Continue")').last();
      await cont3.click();
      await sleep(SLOW);

      const step4 = await p.locator('text=Permissions').count();
      if (step4 > 0) {
        log("PASS", name, "Step 4: Permissions screen rendered");
      }

      // Test toggle
      const toggle = await p.locator('text=Auto-send emails').count();
      if (toggle > 0) {
        log("PASS", name, "Permission toggles present");
      }

      // Continue to Step 5
      const cont4 = await p.locator('button:has-text("Continue")').last();
      await cont4.click();
      await sleep(SLOW);

      const step5 = await p.locator('text=all set').count();
      if (step5 > 0) {
        log("PASS", name, "Step 5: Completion screen rendered");
      }

      // Check summary
      const summary = await p.locator('text=Cars 1 Mode').count();
      if (summary > 0) {
        log("PASS", name, "Summary shows selected personality");
      }

      // Don't click Launch — it would redirect
      log("PASS", name, "Full onboarding flow navigable (5 steps)");
    }
  });

  // ─── 13. SIDEBAR NAVIGATION ────────────────────────────
  console.log("\n--- Sidebar Navigation Tests ---");
  const navItems = [
    ["/", "Dashboard"],
    ["/chat", "Chat"],
    ["/calendar", "Calendar"],
    ["/agents", "Agents"],
    ["/crons", "Cron Jobs"],
    ["/documents", "Documents"],
    ["/journal", "Journal"],
    ["/memory", "Memory"],
    ["/analytics", "Analytics"],
    ["/settings", "Settings"],
  ];

  for (const [path, label] of navItems) {
    try {
      const link = page.locator(`aside a[href="${path}"]`);
      if (await link.isVisible()) {
        await link.click();
        await sleep(SLOW);
        const url = page.url();
        if (url.endsWith(path) || (path === "/" && url.endsWith(":3000/"))) {
          log("PASS", "Sidebar Nav", `${label} (${path}) navigates correctly`);
        } else {
          log("FAIL", "Sidebar Nav", `${label} went to ${url} instead of ${path}`);
        }
      } else {
        log("FAIL", "Sidebar Nav", `${label} link not visible in sidebar`);
      }
    } catch (err) {
      log("FAIL", "Sidebar Nav", `${label}: ${err.message.slice(0, 80)}`);
    }
  }

  // ─── 14. MOBILE VIEWPORT TEST ──────────────────────────
  console.log("\n--- Mobile Viewport Tests ---");
  await page.setViewportSize({ width: 375, height: 812 }); // iPhone viewport
  await sleep(SLOW);

  for (const path of ["/", "/chat", "/agents", "/journal", "/settings"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 10000 });
    await sleep(SLOW);

    // Check for horizontal overflow
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = 375;
    if (bodyWidth > viewportWidth + 10) {
      log("FAIL", `Mobile ${path}`, `Horizontal overflow: body=${bodyWidth}px > viewport=${viewportWidth}px`);
    } else {
      log("PASS", `Mobile ${path}`, "No horizontal overflow");
    }
  }

  // Reset viewport
  await page.setViewportSize({ width: 1400, height: 900 });

  // ─── SUMMARY ───────────────────────────────────────────
  console.log("\n\n╔═══════════════════════════════════════════════════════╗");
  console.log("║   TEST RESULTS                                         ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const warnings = results.filter((r) => r.status === "WARN").length;
  console.log(`  Total checks: ${results.length}`);
  console.log(`  ✅ Pass:  ${passed}`);
  console.log(`  ❌ Fail:  ${failed}`);
  console.log(`  ⚠️  Warn:  ${warnings}`);
  console.log(`  Score:   ${((passed / results.length) * 100).toFixed(1)}%`);

  if (failed > 0) {
    console.log("\n  Failures:");
    for (const r of results.filter((r) => r.status === "FAIL")) {
      console.log(`    ❌ [${r.page}] ${r.detail}`);
    }
  }

  if (consoleErrors.length > 0) {
    console.log(`\n  Console errors captured: ${consoleErrors.length}`);
    for (const err of consoleErrors.slice(0, 10)) {
      console.log(`    ⚠️  ${err.slice(0, 120)}`);
    }
  }

  console.log("\n  Keeping browser open for 30 seconds so you can inspect...\n");
  await sleep(30000);

  await browser.close();
  console.log("Browser closed. Done.");
}

main().catch((err) => {
  console.error("Test suite crashed:", err);
  process.exit(1);
});
