/**
 * Quick API endpoint debugger — tests every proxy route and logs status codes.
 */
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const requests = [];
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/api/") || url.includes("supabase")) {
      requests.push({ url: url.replace(BASE, ""), status: res.status() });
    }
  });

  // Visit each page and collect API calls
  const pages = ["/", "/chat", "/agents", "/agents/Harv", "/crons", "/documents",
                  "/journal", "/memory", "/analytics", "/settings"];

  for (const path of pages) {
    console.log(`\n--- ${path} ---`);
    requests.length = 0;
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 2000));

    for (const req of requests) {
      const icon = req.status >= 400 ? "❌" : "✅";
      if (req.status >= 400) {
        console.log(`  ${icon} ${req.status} ${req.url.slice(0, 100)}`);
      }
    }
    if (requests.filter(r => r.status >= 400).length === 0) {
      console.log("  ✅ All requests OK");
    }
  }

  await browser.close();
}

main().catch(console.error);
