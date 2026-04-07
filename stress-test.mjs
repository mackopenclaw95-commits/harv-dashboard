import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";

// Agents to test with specific prompts
const AGENT_TESTS = [
  { name: "Harv", prompt: "Hey Harv, quick status check — how are you feeling today?" },
  { name: "Finance", prompt: "Give me a quick summary of my spending categories" },
  { name: "Fitness", prompt: "What's a good post-workout meal for recovery?" },
  { name: "Learning", prompt: "Quiz me on one FINRA SIE exam concept" },
  { name: "Trading", prompt: "What's the current BTC price trend?" },
  { name: "Research", prompt: "What are the top 3 headlines today?" },
  { name: "Sports", prompt: "Any NFL news today?" },
  { name: "Music", prompt: "Recommend me 3 songs for a gym playlist" },
  { name: "Travel", prompt: "Plan a quick weekend getaway to Charleston SC" },
  { name: "Shopping", prompt: "What's on my shopping list?" },
  { name: "Email", prompt: "Do I have any unread emails?" },
  { name: "Scheduler", prompt: "What's on my calendar this week?" },
  { name: "Journal", prompt: "Summarize my recent journal entries" },
  { name: "Auto Marketing", prompt: "Draft a tweet about AI productivity" },
  { name: "Video Digest", prompt: "Summarize the latest tech YouTube video you can find" },
  { name: "Image Gen", prompt: "Describe what kind of image you could generate for a Twitter banner" },
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function log(page, msg) {
  console.log(`\n🔹 ${msg}`);
  // Also show status on page via console
}

async function testPage(page, path, label, checks = []) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📄 Testing: ${label} (${path})`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 15000 });
  await sleep(2000);

  // Screenshot
  const screenshotName = `stress-test-${label.toLowerCase().replace(/\s+/g, "-")}.png`;
  await page.screenshot({ path: `docs/${screenshotName}`, fullPage: true });
  console.log(`  📸 Screenshot: docs/${screenshotName}`);

  // Run checks
  for (const check of checks) {
    try {
      await check(page);
    } catch (err) {
      console.log(`  ❌ Check failed: ${err.message}`);
    }
  }
}

async function testAgentChat(page, agentName, prompt) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🤖 Agent: ${agentName}`);
  console.log(`💬 Prompt: "${prompt}"`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const encodedName = encodeURIComponent(agentName);
  await page.goto(`${BASE}/agents/${encodedName}`, {
    waitUntil: "networkidle",
    timeout: 15000,
  });
  await sleep(2000);

  // Find the textarea and type the prompt
  const textarea = page.locator("textarea");
  const count = await textarea.count();
  if (count === 0) {
    console.log(`  ❌ No textarea found on agent page`);
    return { agent: agentName, status: "NO_INPUT", reply: null };
  }

  await textarea.first().click();
  await textarea.first().fill(prompt);
  await sleep(500);

  // Click send button
  const sendBtn = page.locator('button[type="submit"]');
  if ((await sendBtn.count()) === 0) {
    console.log(`  ❌ No send button found`);
    return { agent: agentName, status: "NO_BUTTON", reply: null };
  }

  await sendBtn.first().click();
  console.log(`  ⏳ Waiting for response...`);

  // Wait for the loading indicator to appear then disappear (max 30s)
  try {
    // Wait for the bounce animation (loading dots) to appear
    await page.locator(".animate-bounce").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    // Now wait for it to disappear (response received)
    await page.locator(".animate-bounce").first().waitFor({ state: "hidden", timeout: 45000 });
  } catch {
    console.log(`  ⚠️  Response may have timed out or was instant`);
  }

  await sleep(1000);

  // Get the last assistant message
  const messages = page.locator(".whitespace-pre-wrap");
  const msgCount = await messages.count();

  let replyText = null;
  if (msgCount > 0) {
    replyText = await messages.last().textContent();
    const preview = replyText.substring(0, 150).replace(/\n/g, " ");
    console.log(`  ✅ Reply (${replyText.length} chars): "${preview}..."`);
  } else {
    console.log(`  ❌ No reply messages found`);
  }

  // Screenshot
  const screenshotName = `stress-test-agent-${agentName.toLowerCase().replace(/\s+/g, "-")}.png`;
  await page.screenshot({ path: `docs/${screenshotName}`, fullPage: false });
  console.log(`  📸 Screenshot: docs/${screenshotName}`);

  return {
    agent: agentName,
    status: replyText ? "OK" : "NO_REPLY",
    reply: replyText ? replyText.substring(0, 200) : null,
  };
}

async function testHarvChat(page) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🧠 Testing Main Harv Chat (/chat)`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 15000 });
  await sleep(2000);

  const textarea = page.locator("textarea");
  await textarea.first().click();
  await textarea.first().fill("Hey Harv! Just running a stress test on the dashboard. Give me a quick system status.");
  await sleep(500);

  // Check the paperclip button exists (file upload)
  const paperclip = page.locator('button:has(svg.lucide-paperclip)');
  const hasUpload = (await paperclip.count()) > 0;
  console.log(`  📎 File upload button: ${hasUpload ? "✅ Found" : "❌ Missing"}`);

  // Send the message
  const sendBtn = page.locator('button[type="submit"]');
  await sendBtn.first().click();
  console.log(`  ⏳ Waiting for Harv's response...`);

  try {
    await page.locator(".animate-bounce").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    await page.locator(".animate-bounce").first().waitFor({ state: "hidden", timeout: 45000 });
  } catch {
    console.log(`  ⚠️  Response timeout or instant`);
  }

  await sleep(1000);

  const messages = page.locator(".whitespace-pre-wrap");
  const msgCount = await messages.count();
  if (msgCount > 0) {
    const reply = await messages.last().textContent();
    console.log(`  ✅ Harv replied (${reply.length} chars): "${reply.substring(0, 150)}..."`);
  }

  await page.screenshot({ path: "docs/stress-test-harv-chat.png", fullPage: false });
}

async function testFileUploadUI(page) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📎 Testing File Upload UI`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  await page.goto(`${BASE}/chat`, { waitUntil: "networkidle", timeout: 15000 });
  await sleep(2000);

  // Trigger file input with a test file
  const fileInput = page.locator('input[type="file"]');
  if ((await fileInput.count()) > 0) {
    // Create a fake test file via the file chooser
    await fileInput.first().setInputFiles({
      name: "test-document.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("This is a test file for stress testing."),
    });
    await sleep(1000);

    // Check if chip appeared
    const chipText = await page.locator("text=test-document.txt").count();
    console.log(`  📄 File chip displayed: ${chipText > 0 ? "✅ Yes" : "❌ No"}`);

    await page.screenshot({ path: "docs/stress-test-file-upload.png", fullPage: false });
    console.log(`  📸 Screenshot: docs/stress-test-file-upload.png`);

    // Remove the file
    const removeBtn = page.locator('button:has(svg.lucide-x)');
    if ((await removeBtn.count()) > 0) {
      await removeBtn.first().click();
      await sleep(500);
      const chipAfter = await page.locator("text=test-document.txt").count();
      console.log(`  🗑️  File removed: ${chipAfter === 0 ? "✅ Yes" : "❌ No"}`);
    }
  } else {
    console.log(`  ❌ No file input found`);
  }
}

// ─── MAIN ───────────────────────────────────────────────
async function main() {
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║   HARV DASHBOARD STRESS TEST                  ║");
  console.log("║   Playwright + Chromium — LIVE                ║");
  console.log("╚═══════════════════════════════════════════════╝\n");

  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,
    args: ["--start-maximized"],
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const results = [];

  // ── Phase 1: Page Load Tests ──
  console.log("\n\n🏁 PHASE 1: PAGE LOAD TESTS\n");

  await testPage(page, "/", "Dashboard", [
    async (p) => {
      const cards = p.locator('[data-slot="card"]');
      const count = await cards.count();
      console.log(`  📊 Dashboard cards found: ${count}`);
    },
  ]);

  await testPage(page, "/agents", "Agents List", [
    async (p) => {
      const text = await p.textContent("body");
      const hasAgents = text.includes("Harv") && text.includes("Finance");
      console.log(`  🤖 Agents loaded: ${hasAgents ? "✅ Yes" : "❌ No"}`);
    },
  ]);

  await testPage(page, "/crons", "Cron Jobs");
  await testPage(page, "/documents", "Documents");
  await testPage(page, "/memory", "Memory");
  await testPage(page, "/analytics", "Analytics");
  await testPage(page, "/settings", "Settings", [
    async (p) => {
      const healthBtn = p.locator("text=Run Health Check").or(p.locator("text=Check Health")).or(p.locator("text=health"));
      if ((await healthBtn.count()) > 0) {
        await healthBtn.first().click();
        await sleep(3000);
        console.log(`  💚 Health check triggered`);
      }
    },
  ]);

  // ── Phase 2: File Upload UI Test ──
  console.log("\n\n🏁 PHASE 2: FILE UPLOAD UI TEST\n");
  await testFileUploadUI(page);

  // ── Phase 3: Main Harv Chat ──
  console.log("\n\n🏁 PHASE 3: HARV CHAT TEST\n");
  await testHarvChat(page);

  // ── Phase 4: Agent Chat Tests ──
  console.log("\n\n🏁 PHASE 4: AGENT STRESS TESTS\n");

  for (const test of AGENT_TESTS) {
    try {
      const result = await testAgentChat(page, test.name, test.prompt);
      results.push(result);
    } catch (err) {
      console.log(`  ❌ CRASH testing ${test.name}: ${err.message}`);
      results.push({ agent: test.name, status: "CRASH", reply: null });
    }
    // Small pause between agents
    await sleep(1000);
  }

  // ── Summary ──
  console.log("\n\n╔═══════════════════════════════════════════════╗");
  console.log("║   STRESS TEST RESULTS                          ║");
  console.log("╚═══════════════════════════════════════════════╝\n");

  const ok = results.filter((r) => r.status === "OK").length;
  const fail = results.filter((r) => r.status !== "OK").length;

  console.log(`  Total agents tested: ${results.length}`);
  console.log(`  ✅ Responded: ${ok}`);
  console.log(`  ❌ Failed:    ${fail}\n`);

  console.log("  Agent               Status     Reply Preview");
  console.log("  ─────────────────── ────────── ──────────────────────────────────");
  for (const r of results) {
    const name = r.agent.padEnd(20);
    const status = r.status.padEnd(10);
    const preview = r.reply ? r.reply.substring(0, 40).replace(/\n/g, " ") + "..." : "—";
    console.log(`  ${name} ${status} ${preview}`);
  }

  console.log("\n\n  🏁 Stress test complete. Browser staying open for manual review.");
  console.log("  Press Ctrl+C to close.\n");

  // Keep browser open for manual inspection
  await new Promise(() => {});
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
