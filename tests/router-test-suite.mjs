/**
 * Router Test Suite — 100+ prompts testing routing accuracy
 * Runs router.py --test on the VPS via SSH to get routing decisions
 * without actually executing agents.
 *
 * Usage: node tests/router-test-suite.mjs
 */

import { execSync } from "child_process";
import { writeFileSync } from "fs";

const SSH = 'ssh -i ~/.ssh/harv_vps root@187.77.220.169';
const ROUTER = 'cd /root/harv && python3 agents/router.py --test';

// [prompt, expectedAgent, category]
const TESTS = [
  // === HARV (general / unclear) ===
  ["Hey what's up", "Harv", "general"],
  ["Tell me a joke", "Harv", "general"],
  ["What can you do?", "Harv", "general"],
  ["Thanks for the help", "Harv", "general"],
  ["Good morning", "Harv", "general"],

  // === JOURNAL (memory / recall) ===
  ["What did we talk about yesterday?", "Journal", "memory"],
  ["Remember that thing about the API keys?", "Journal", "memory"],
  ["Save this as a note for later", "Journal", "memory"],
  ["What happened last Tuesday?", "Journal", "memory"],
  ["Log this thought: need to refactor the auth flow", "Journal", "memory"],

  // === SCHEDULER (calendar / time) ===
  ["What's on my calendar tomorrow?", "Scheduler", "calendar"],
  ["Schedule a meeting for Friday at 2pm", "Scheduler", "calendar"],
  ["Remind me to call the dentist at 3pm", "Scheduler", "calendar"],
  ["Am I free this Saturday?", "Scheduler", "calendar"],
  ["Cancel my 4pm appointment", "Scheduler", "calendar"],

  // === EMAIL (gmail) ===
  ["Check my email", "Email", "email"],
  ["Send an email to john@example.com about the project update", "Email", "email"],
  ["Do I have any unread emails?", "Email", "email"],
  ["Draft a reply to the last email from my boss", "Email", "email"],
  ["Archive all newsletters", "Email", "email"],

  // === LEARNING (education / tutoring) ===
  ["Quiz me on JavaScript closures", "Learning", "education"],
  ["Explain how TCP/IP works", "Learning", "education"],
  ["Create flashcards for my biology exam", "Learning", "education"],
  ["Help me study for the SIE exam", "Learning", "education"],
  ["What's the difference between SQL and NoSQL?", "Learning", "education"],

  // === TRAVEL ===
  ["Plan a weekend trip to Miami", "Travel", "travel"],
  ["Find cheap flights to New York", "Travel", "travel"],
  ["What's the best time to visit Japan?", "Travel", "travel"],
  ["Create a 3-day itinerary for Austin Texas", "Travel", "travel"],
  ["How much would a trip to Cancun cost?", "Travel", "travel"],

  // === RESEARCH ===
  ["Search for the latest news on AI regulation", "Research", "research"],
  ["Compare Tesla vs Rivian stock performance", "Research", "research"],
  ["What are the top headlines today?", "Research", "research"],
  ["Fact check: does coffee stunt your growth?", "Research", "research"],
  ["Give me a summary of the latest tech news", "Research", "research"],

  // === VIDEO DIGEST ===
  ["Summarize this YouTube video: https://youtube.com/watch?v=abc123", "Video Digest", "video"],
  ["What's this video about? https://youtu.be/xyz789", "Video Digest", "video"],
  ["Transcribe this TikTok video", "Video Digest", "video"],
  ["Digest this video for me", "Video Digest", "video"],
  ["At 5:30 in this video he talks about React hooks", "Video Digest", "video"],

  // === IMAGE GEN ===
  ["Generate an image of a sunset over the ocean", "Image Gen", "image"],
  ["Create a Twitter banner for my profile", "Image Gen", "image"],
  ["Draw me a logo for my startup", "Image Gen", "image"],
  ["Make a profile picture that looks professional", "Image Gen", "image"],

  // === AUTO MARKETING ===
  ["Draft a tweet about our new feature", "Auto Marketing", "marketing"],
  ["Create a social media post for Instagram", "Auto Marketing", "marketing"],
  ["Write a Reddit post about Harv AI", "Auto Marketing", "marketing"],
  ["Plan a content strategy for this week", "Auto Marketing", "marketing"],

  // === DRIVE ===
  ["Upload this file to Google Drive", "Drive", "drive"],
  ["List files in my Harv folder", "Drive", "drive"],
  ["Read the document called meeting-notes.txt", "Drive", "drive"],

  // === EDGE CASES (ambiguous / could go either way) ===
  ["I need to prepare for my trip to Paris and study French", "Travel", "ambiguous"],
  ["Email my calendar to my boss", "Email", "ambiguous"],
  ["Search YouTube for cooking tutorials and summarize the best one", "Video Digest", "ambiguous"],
  ["What's the weather like in Miami? I might fly down", "Travel", "ambiguous"],
  ["Find me a good deal on a laptop", "Research", "ambiguous"],
  ["Help me write a blog post about AI trends", "Auto Marketing", "ambiguous"],
  ["Remind me about what we discussed regarding the budget", "Journal", "ambiguous"],
  ["Take notes on this meeting and add action items to my calendar", "Journal", "ambiguous"],

  // === SPORTS ===
  ["What's the score of the Lakers game?", "Sports", "sports"],
  ["Who won the NFL game last night?", "Sports", "sports"],
  ["Show me the NBA standings", "Sports", "sports"],
  ["When do the Panthers play next?", "Sports", "sports"],
  ["Give me a recap of March Madness", "Sports", "sports"],

  // === MUSIC ===
  ["Play some chill music", "Music", "music"],
  ["Add this song to my playlist", "Music", "music"],
  ["What am I listening to right now?", "Music", "music"],
  ["Recommend some workout music", "Music", "music"],

  // === TRADING ===
  ["What are the odds on Polymarket for the election?", "Trading", "trading"],
  ["Show me my paper trading portfolio", "Trading", "trading"],
  ["Check BTC price", "Trading", "trading"],
  ["Any good Kalshi markets today?", "Trading", "trading"],

  // === FINANCE ===
  ["I spent $45 on groceries at Publix", "Finance", "finance"],
  ["What's my budget looking like this month?", "Finance", "finance"],
  ["Log a $200 car payment", "Finance", "finance"],
  ["How much did I spend on food last week?", "Finance", "finance"],

  // === FITNESS ===
  ["I ran 3 miles today", "Fitness", "fitness"],
  ["Log my workout: bench press 225x5, squat 315x3", "Fitness", "fitness"],
  ["What's my workout streak?", "Fitness", "fitness"],
  ["Pull up my fitness stats", "Fitness", "fitness"],

  // === SHOPPING ===
  ["Add milk and eggs to my grocery list", "Shopping", "shopping"],
  ["I need to pick up stuff from Walmart", "Shopping", "shopping"],
  ["Find me the best deal on AirPods", "Shopping", "shopping"],

  // === MEDIA MANAGER ===
  ["Create a video of my trip highlights", "Media Manager", "media"],
  ["Edit this video and add subtitles", "Media Manager", "media"],
  ["Make me a profile picture", "Image Gen", "media"],

  // === YOUTUBE DIGEST ===
  ["Summarize this video https://youtube.com/watch?v=dQw4w9WgXcQ", "YouTube Digest", "youtube"],
  ["What does this YouTuber talk about? https://youtu.be/abc", "YouTube Digest", "youtube"],

  // === MISSPELLINGS / TYPOS ===
  ["Scheudule a meeting tmrw at 10am", "Scheduler", "misspelling"],
  ["Cehck my emal inbox", "Email", "misspelling"],
  ["Whats the scroe of the game", "Sports", "misspelling"],
  ["Serach for best laptops 2024", "Research", "misspelling"],
  ["I spnt 50 bucks on gas", "Finance", "misspelling"],

  // === MULTI-INTENT (should route to primary) ===
  ["Research the best gym equipment and add it to my shopping list", "Research", "multi-intent"],
  ["Check my email and then schedule a follow-up meeting", "Email", "multi-intent"],
  ["Find cheap flights and add the trip to my calendar", "Travel", "multi-intent"],
  ["Look up a recipe and add ingredients to shopping list", "Research", "multi-intent"],

  // === TRICKY / AMBIGUOUS ===
  ["Set a timer for 10 minutes", "Scheduler", "tricky"],
  ["How's the market doing today?", "Trading", "tricky"],
  ["I need to book something for next weekend", "Travel", "tricky"],
  ["What did Mack ask about last time?", "Journal", "tricky"],
  ["Play the video I was watching earlier", "Video Digest", "tricky"],
  ["Post the image I generated to Twitter", "Auto Marketing", "tricky"],
  ["How much is gas right now?", "Research", "tricky"],
  ["Show me what's trending", "Research", "tricky"],
];

function testRouter(prompt) {
  const escaped = prompt.replace(/'/g, "'\\''");
  const cmd = `${SSH} "${ROUTER} '${escaped}'" 2>&1`;
  try {
    const output = execSync(cmd, { timeout: 30000, encoding: "utf8" }).trim();
    // Output format from router.py --test: "→ Agent: AgentName (confidence: high/medium/low)"
    // or just the raw routing output
    // Parse "Agent:      Email" and "Confidence: high" from --test output
    const agentMatch = output.match(/^Agent:\s*(.+)$/im);
    const confMatch = output.match(/^Confidence:\s*(high|medium|low|unknown)$/im);

    let agent = "unknown";
    let confidence = "unknown";

    if (agentMatch) {
      agent = agentMatch[1].trim();
    }
    if (confMatch) {
      confidence = confMatch[1].toLowerCase();
    }

    return { agent, confidence, raw: output };
  } catch (err) {
    return { agent: "ERROR", confidence: "none", raw: err.message.slice(0, 200) };
  }
}

function main() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║   ROUTER TEST SUITE — via VPS --test                   ║");
  console.log(`║   ${TESTS.length} prompts across ${[...new Set(TESTS.map(t => t[2]))].length} categories                          ║`);
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const results = [];
  let passed = 0;
  let failed = 0;
  let errors = 0;

  for (let i = 0; i < TESTS.length; i++) {
    const [prompt, expected, category] = TESTS[i];
    const num = `[${(i + 1).toString().padStart(2)}/${TESTS.length}]`;

    const result = testRouter(prompt);
    const match = result.agent.toLowerCase() === expected.toLowerCase();

    if (result.agent === "ERROR") {
      errors++;
      console.log(`${num} ERROR  ${prompt.slice(0, 50).padEnd(50)} → ${result.raw.slice(0, 40)}`);
    } else if (match) {
      passed++;
      console.log(`${num} ✅ PASS ${prompt.slice(0, 50).padEnd(50)} → ${result.agent} [${result.confidence}]`);
    } else {
      failed++;
      console.log(`${num} ❌ FAIL ${prompt.slice(0, 50).padEnd(50)} → ${result.agent} [${result.confidence}] (expected: ${expected})`);
    }

    results.push({
      prompt,
      expected,
      actual: result.agent,
      confidence: result.confidence,
      match,
      category,
      raw: result.raw.slice(0, 200),
    });
  }

  // ─── Summary ─────────────────────────────────────────
  console.log("\n\n╔═══════════════════════════════════════════════════════╗");
  console.log("║   RESULTS                                              ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  const total = TESTS.length;
  const pct = ((passed / total) * 100).toFixed(1);

  console.log(`  Total:    ${total}`);
  console.log(`  ✅ Pass:   ${passed} (${pct}%)`);
  console.log(`  ❌ Fail:   ${failed}`);
  console.log(`  ⚠️  Error:  ${errors}`);

  // By category
  console.log("\n  By category:");
  const categories = [...new Set(TESTS.map((t) => t[2]))];
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.match).length;
    const catTotal = catResults.length;
    const status = catPassed === catTotal ? "✅" : catPassed > catTotal / 2 ? "⚠️" : "❌";
    console.log(`    ${status} ${cat.padEnd(15)} ${catPassed}/${catTotal}`);
  }

  // Confidence breakdown
  const highConf = results.filter(r => r.confidence === "high").length;
  const medConf = results.filter(r => r.confidence === "medium").length;
  const lowConf = results.filter(r => r.confidence === "low").length;
  const unkConf = results.filter(r => !["high","medium","low"].includes(r.confidence)).length;
  console.log("\n  Confidence distribution:");
  console.log(`    High:    ${highConf}`);
  console.log(`    Medium:  ${medConf}`);
  console.log(`    Low:     ${lowConf} (falls back to Harv)`);
  if (unkConf > 0) console.log(`    Unknown: ${unkConf}`);

  // Failures detail
  const failures = results.filter((r) => !r.match && r.actual !== "ERROR");
  if (failures.length > 0) {
    console.log("\n  Misrouted prompts:");
    for (const f of failures) {
      console.log(`    "${f.prompt.slice(0, 60)}"`);
      console.log(`      Expected: ${f.expected} | Got: ${f.actual} (${f.confidence})`);
    }
  }

  // Save results
  writeFileSync("tests/router-test-results.json", JSON.stringify(results, null, 2));
  console.log("\n  Results saved to: tests/router-test-results.json\n");
}

main();
