import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM = "Harv <noreply@harvai.app>";

type AlertType = "weekly_80" | "weekly_100" | "monthly_80" | "monthly_100";

const SUBJECTS: Record<AlertType, string> = {
  weekly_80: "You've used 80% of your weekly Harv budget",
  weekly_100: "Weekly limit reached — chats paused until next week",
  monthly_80: "You've used 80% of your monthly Harv budget",
  monthly_100: "Monthly limit reached — chats paused until the 1st",
};

function body(type: AlertType, spent: number, cap: number): string {
  const pct = Math.round((spent / cap) * 100);
  const spentStr = `$${spent.toFixed(2)}`;
  const capStr = `$${cap.toFixed(2)}`;

  if (type === "weekly_80") {
    return [
      `You've used ${pct}% of your weekly Harv API budget (${spentStr} of ${capStr}).`,
      "",
      "Your weekly budget paces your usage so it lasts all month. If you need more, consider upgrading your plan.",
      "",
      "Manage your plan: https://harv-dashboard.vercel.app/settings?tab=billing",
    ].join("\n");
  }
  if (type === "weekly_100") {
    return [
      `You've hit your weekly cost limit (${spentStr} / ${capStr}).`,
      "",
      "Chat is paused until next week to pace your monthly budget. Upgrade for a higher weekly allowance.",
      "",
      "Manage your plan: https://harv-dashboard.vercel.app/settings?tab=billing",
    ].join("\n");
  }
  if (type === "monthly_80") {
    return [
      `You've used ${pct}% of your monthly Harv API budget (${spentStr} of ${capStr}).`,
      "",
      "Once you hit the monthly cap, chats will be paused until the 1st of next month.",
      "",
      "Manage your plan: https://harv-dashboard.vercel.app/settings?tab=billing",
    ].join("\n");
  }
  // monthly_100
  return [
    `You've reached your monthly cost limit (${spentStr} / ${capStr}).`,
    "",
    "Chat is paused until the 1st of next month. Upgrade your plan for a higher monthly allowance.",
    "",
    "Manage your plan: https://harv-dashboard.vercel.app/settings?tab=billing",
  ].join("\n");
}

export async function sendCostAlert(
  email: string,
  type: AlertType,
  spent: number,
  cap: number,
): Promise<boolean> {
  if (!resend) {
    console.warn("[email] RESEND_API_KEY not set — skipping cost alert email");
    return false;
  }
  try {
    await resend.emails.send({
      from: FROM,
      to: email,
      subject: SUBJECTS[type],
      text: body(type, spent, cap),
    });
    return true;
  } catch (err) {
    console.error("[email] Failed to send cost alert:", err);
    return false;
  }
}
