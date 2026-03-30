// Agent-specific routing messages shown in typing bubble while Harv routes to an agent
export const ROUTING_MESSAGES: Record<string, string> = {
  Harv: "On it...",
  Research: "Got my research guy on it...",
  Scheduler: "Let me check the schedule...",
  Email: "Checking the inbox...",
  Fitness: "Let me pull up your stats...",
  Finance: "Crunching the numbers...",
  Journal: "Flipping through the journal...",
  Travel: "Scouting some options...",
  Shopping: "Looking into that...",
  Sports: "Checking the scores...",
  Music: "Queuing something up...",
  Trading: "Watching the markets...",
  Learning: "Let me break that down...",
  "Video Digest": "Breaking down that video...",
  "YouTube Digest": "Breaking down that video...",
  "Auto Marketing": "Drafting something up...",
  "Image Gen": "Cooking up a visual...",
  "Media Manager": "Getting the creative team on it...",
  "Automation Builder": "Designing your automation...",
};

export const DEFAULT_ROUTING_MESSAGE = "On it...";

// Ka-chow mode routing messages — Lightning McQueen style
export const KACHOW_ROUTING_MESSAGES: string[] = [
  "Focus. Speed. I am speed. 🏎️",
  "Ka-chow! Flooring it...",
  "Faster than fast, quicker than quick...",
  "Oh yeah Lightning's Ready...",
  "Pitstop... fueling up the answer...",
  "Just watch this right here, lover boy.",
  "Green flag — we're racing! 🏁",
  "Turn right to go left...",
  "Thunder always comes after Lightning...",
  "Every third blink is slower...",
  "I create feelings in others that they themselves don't understand.",
];

export const KACHOW_GREETINGS: string[] = [
  "Speed. I am speed. What do you need? 🏎️",
  "Ka-chow! Ready to race. What's the mission?",
  "Float like a Cadillac, sting like a Beemer. Talk to me.",
  "I'm a precision instrument of speed and aerodynamics.",
  "I eat losers for breakfast. What are we building?",
];

export const KACHOW_PLACEHOLDERS: string[] = [
  "Focus. Speed. I am speed.",
  "Float like a Cadillac, sting like a Beemer.",
  "One winner, 42 losers. I eat losers for breakfast.",
  "It's an empty cup...",
  "I'm in hillbilly hell!",
  "Pitstop!",
  "I create feelings in others that they themselves don't understand.",
  "Faster than fast, quicker than quick. I am Lightning.",
  "Oh yeah Lightning's Ready.",
  "Just watch this right here, lover boy.",
  "Thunder always comes after... Lightning!",
  "Every third blink is slower.",
  "Drive it in deep, hope it sticks...",
  "Turn right to go left...",
  "Ka-chow!",
];

export function getRoutingMessage(agentName: string, isKachow = false): string {
  if (isKachow) {
    return KACHOW_ROUTING_MESSAGES[Math.floor(Math.random() * KACHOW_ROUTING_MESSAGES.length)];
  }
  return ROUTING_MESSAGES[agentName] || DEFAULT_ROUTING_MESSAGE;
}

export function getKachowGreeting(name?: string): string {
  const greeting = KACHOW_GREETINGS[Math.floor(Math.random() * KACHOW_GREETINGS.length)];
  return name ? greeting.replace("What do you need?", `What do you need, ${name}?`) : greeting;
}

// ─── Agent classification (shared across Agents page + Chat agents tab) ───

/** Agents marked "coming soon" on the Agents page — not yet fully wired */
export const COMING_SOON_AGENTS = new Set([
  "Music",
  "Fitness",
  "Finance",
  "Shopping",
  "Sports",
  "Trading",
  "Travel",
  "Auto Marketing",
]);

/** Planned sub-agents not yet implemented on the backend */
export const PLANNED_AGENTS = new Set([
  "TikTok Digest",
  "Twitter Digest",
  "Video Gen",
  "Video Editor",
  "Product Research",
  "Market Research",
  "Data Viz",
]);

/** Agents that should NOT appear in chat interfaces (orchestrators, tools, bg, coming soon, planned) */
export const NO_CHAT_AGENTS = new Set([
  "Router",
  ...COMING_SOON_AGENTS,
  ...PLANNED_AGENTS,
]);
