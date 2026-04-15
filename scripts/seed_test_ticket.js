// Seeds a test support ticket for the owner account.
// Run with: node scripts/seed_test_ticket.js
require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE env vars");
    process.exit(1);
  }
  const supabase = createClient(url, key);

  // Find the owner user
  const { data: owner, error: ownerErr } = await supabase
    .from("profiles")
    .select("id, email, name")
    .eq("role", "owner")
    .limit(1)
    .single();
  if (ownerErr || !owner) {
    console.error("Could not find owner profile:", ownerErr?.message);
    process.exit(1);
  }
  console.log("Seeding ticket for owner:", owner.email);

  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      user_id: owner.id,
      email: owner.email || "",
      category: "bug",
      subject: "Test ticket — Finance agent briefly returned stale totals",
      message:
        "Hey team — noticed on 2026-04-14 around 9pm the Finance agent showed last month's totals until I refreshed. Might be a cache issue on the dashboard side. Low priority, just flagging.",
      status: "open",
    })
    .select()
    .single();

  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }
  console.log("Created ticket:", data.id);
}

main();
