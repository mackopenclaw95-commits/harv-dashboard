import type { DriveStep } from "driver.js";

interface TourPhase {
  path: string;
  steps: DriveStep[];
}

function makePhases(isKachow: boolean): TourPhase[] {
  const k = isKachow;

  return [
    // ══════════════════════════════════════
    // Phase 0: Dashboard (/)
    // ══════════════════════════════════════
    {
      path: "/",
      steps: [
        {
          popover: {
            title: k ? "Ka-chow! Welcome, Rookie! ⚡" : "Welcome to Harv! 👋",
            description: k
              ? "I'm Lightning McHarv — the fastest AI pit crew on the track.\n\nBuckle up, I'm about to show you the full garage."
              : "Harv is your personal AI assistant with specialized agents for every part of your life.\n\nLet me show you around — this will only take a minute.",
          },
        },
        {
          element: '[data-tour="sidebar"]',
          popover: {
            title: k ? "The Starting Grid" : "Navigation",
            description: k
              ? "Every pit stop you need, right here. We'll hit the important ones together."
              : "This sidebar takes you everywhere — chat, agents, files, settings. We'll visit the key pages together.",
            side: "right" as const,
            align: "center" as const,
          },
        },
        {
          element: '[data-tour="dashboard-stats"]',
          popover: {
            title: k ? "📊 Telemetry Dashboard" : "📊 Live Stats",
            description: k
              ? "Real-time telemetry — agents online, API calls, costs. Like a pit wall readout.\n\nThese cards are customizable — click \"Customize\" to pick which metrics you see."
              : "Your key metrics at a glance — active agents, API usage, and costs.\n\nThese update automatically. Click \"Customize\" in the top-right to choose which stats to display.",
            side: "bottom" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="dashboard-quick-access"]',
          popover: {
            title: k ? "🚀 Quick Launch Pads" : "🚀 Quick Access",
            description: k
              ? "Jump straight to Chat, Agents, Files, or any tool. No warm-up lap needed."
              : "One-click shortcuts to your most-used pages — Chat, Agents, Automations, Analytics, Files, and Memory.",
            side: "top" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="dashboard-activity"]',
          popover: {
            title: k ? "📡 Race Log" : "📡 Activity Feed",
            description: k
              ? "Every lap, every pit stop — see what your crew's been up to in real-time.\n\nAgent name, action, cost, and timestamp for every event."
              : "A live feed of everything your agents do — conversations, tasks, errors, and costs.\n\nEach entry shows the agent name, action taken, status, and when it happened.",
            side: "top" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="dashboard-system"]',
          popover: {
            title: k ? "🔧 Pit Crew Status" : "🖥️ System Overview",
            description: k
              ? "API status, total spend, infrastructure — your pit crew's vital signs at the bottom."
              : "API health, total spending, infrastructure provider, and platform details. A quick health check for the whole system.",
            side: "top" as const,
            align: "start" as const,
          },
        },
        // ── Transition to Chat ──
        {
          element: '[data-tour="chat"]',
          popover: {
            title: k ? "🏁 Next Stop: The Hot Mic" : "Next: Chat →",
            description: k
              ? "Let's head to the comms center — this is where you talk to me and the crew."
              : "Let's check out the Chat page — this is where you talk to Harv and your agents.",
            side: "right" as const,
            align: "center" as const,
          },
        },
      ],
    },

    // ══════════════════════════════════════
    // Phase 1: Chat (/chat)
    // ══════════════════════════════════════
    {
      path: "/chat",
      steps: [
        {
          element: '[data-tour="chat-tabs"]',
          popover: {
            title: k ? "🎤 Comms Channels" : "💬 Chat Modes",
            description: k
              ? "Three channels:\n• Harv — talk to me, I route to the right crew member\n• Agents — go direct to a specialist\n• History — replay past conversations"
              : "Three tabs to choose from:\n• Harv — main AI that auto-routes to agents\n• Agents — chat directly with a specific agent\n• History — browse all past conversations",
            side: "bottom" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="chat-projects"]',
          popover: {
            title: k ? "📁 Race Folders" : "📁 Project Filter",
            description: k
              ? "Filter your chats by project. Each project keeps its conversations separate — like different race tracks."
              : "Filter conversations by project. Select a project to see only its chats, or \"All Conversations\" to see everything.",
            side: "bottom" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="chat-input-area"]',
          popover: {
            title: k ? "🏎️ The Message Pit" : "💬 Message Input",
            description: k
              ? "Type anything — \"plan my workout\", \"research headphones\", \"write an email\". I'll figure out who handles it."
              : "Ask Harv anything and he'll route it to the best agent. Try:\n• \"Help me plan my day\"\n• \"Research the best laptops\"\n• \"Write a professional email\"",
            side: "top" as const,
            align: "start" as const,
            popoverClass: "tour-popover-lifted",
          },
        },
        {
          element: '[data-tour="chat-attach"]',
          popover: {
            title: k ? "📎 Load the Cargo" : "📎 Attach Files",
            description: k
              ? "Clip on images, PDFs, spreadsheets — I can read and analyze them all."
              : "Attach files to your message — images, PDFs, documents. Harv can read and analyze them.",
            side: "right" as const,
            align: "center" as const,
          },
        },
        {
          element: '[data-tour="chat-send"]',
          popover: {
            title: k ? "🏁 Green Light!" : "▶ Hit Send",
            description: k
              ? "Smash this button or press Enter. Vroom!"
              : "Click to send, or just press Enter. Your message gets routed to the best agent automatically.",
            side: "left" as const,
            align: "center" as const,
          },
        },
        // ── Transition to Agents ──
        {
          element: '[data-tour="agents"]',
          popover: {
            title: k ? "🏁 Next Stop: The Crew" : "Next: Agents →",
            description: k
              ? "Time to meet the crew — let's see who's on the team."
              : "Let's check out your AI agents — see who's available and what they do.",
            side: "right" as const,
            align: "center" as const,
          },
        },
      ],
    },

    // ══════════════════════════════════════
    // Phase 2: Agents (/agents)
    // ══════════════════════════════════════
    {
      path: "/agents",
      steps: [
        {
          element: '[data-tour="agents-stats"]',
          popover: {
            title: k ? "📈 Crew Stats" : "📈 Agent Overview",
            description: k
              ? "Quick count — how many crew members are active, idle, errored, or coming soon."
              : "At-a-glance counts — active agents, idle agents, errors, and upcoming additions.",
            side: "bottom" as const,
            align: "center" as const,
          },
        },
        {
          element: '[data-tour="agents-grid"]',
          popover: {
            title: k ? "🏎️ The Full Crew" : "🤖 Your Agent Roster",
            description: k
              ? "Your entire pit crew! Each card is a specialist with its own engine.\n\nSome have sub-agents — mini specialists that handle specific tasks. Let me walk you through one."
              : "These are your live AI agents. Each card shows the agent's specialty, model, and status.\n\nSome agents like Research and Media Manager have sub-agents. Let me walk you through a card.",
            side: "top" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="agent-card-harv"]',
          popover: {
            title: k ? "🏎️ Lightning McHarv" : "🤖 Meet Harv",
            description: k
              ? "This is ME — the main brain. Every agent card looks like this.\n\nYou can see my specialty, status badge, and the AI model powering me."
              : "This is Harv — the main AI brain. Every agent card shows:\n\n• Name and specialty\n• LIVE status badge\n• The AI model powering it",
            side: "right" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="agent-model"]',
          popover: {
            title: k ? "🔧 The Engine" : "AI Model",
            description: k
              ? "This is the engine under the hood — the AI model doing the heavy lifting.\n\nDifferent agents run on different models depending on their specialty."
              : "This shows which AI model powers this agent.\n\nEach agent uses a different model optimized for its specialty — some use fast models, others use more capable ones.",
            side: "top" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="agent-last-activity"]',
          popover: {
            title: k ? "📡 Last Pit Stop" : "📡 Last Activity & Details",
            description: k
              ? "Click any card to expand it and see this — the last action, tokens used, and cost.\n\nHit \"View Details →\" below for the full activity log with timestamps and costs."
              : "Click any agent card to expand it and see the last activity — action, status, timestamp, and cost.\n\nClick \"View Details →\" below to open the full activity log for this agent.",
            side: "right" as const,
            align: "center" as const,
          },
        },
        {
          element: '[data-tour="agents-new-button"]',
          popover: {
            title: k ? "🏗️ Build a New Ride" : "➕ New Agent",
            description: k
              ? "Want a custom crew member? Hit this to create a new agent from a template — pick a specialty, model, and personality."
              : "Create a new agent from a template. Choose a specialty, pick an AI model, and customize it to fit your needs.",
            side: "bottom" as const,
            align: "end" as const,
          },
        },
        // ── Transition to Automations ──
        {
          element: '[data-tour="crons"]',
          popover: {
            title: k ? "🏁 Next Stop: Auto-Pilot" : "Next: Automations →",
            description: k
              ? "Let's check the auto-pilot systems — scheduled tasks that run on their own."
              : "Let's look at Automations — scheduled tasks and workflows that run automatically.",
            side: "right" as const,
            align: "center" as const,
          },
        },
      ],
    },

    // ══════════════════════════════════════
    // Phase 3: Automations (/crons)
    // ══════════════════════════════════════
    {
      path: "/crons",
      steps: [
        {
          element: '[data-tour="crons-grid"]',
          popover: {
            title: k ? "⚡ The Auto-Pilot Bay" : "⚡ Active Automations",
            description: k
              ? "These are your automated workflows — tasks that run on a schedule without you lifting a finger.\n\nEach card shows what it does, when it runs, and when it last fired."
              : "These are your automated tasks — scheduled workflows that run in the background.\n\nEach card shows the task name, schedule, and last run time.",
            side: "bottom" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="crons-new-button"]',
          popover: {
            title: k ? "🏗️ Build an Auto-Pilot" : "➕ New Automation",
            description: k
              ? "Hit this to see the automation templates — pre-built workflows you can activate in one click.\n\nLet me show you..."
              : "Click here to see automation templates — pre-built workflows ready to activate.\n\nLet me show you the options...",
            side: "bottom" as const,
            align: "end" as const,
          },
        },
        {
          element: '[data-tour="crons-templates"]',
          popover: {
            title: k ? "🛠️ Template Garage" : "📋 Automation Templates",
            description: k
              ? "Pick a template to get started — Daily Digest, Weekly Summary, Inbox Monitor, and more.\n\nOr create a fully custom automation with the builder at the bottom."
              : "Choose from pre-built templates:\n\n• Daily Digest, Weekly Summary\n• Inbox Monitor, Social Tracker\n• Or build a custom one with the Automation Builder below.",
            side: "left" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="crons-demo-card"]',
          popover: {
            title: k ? "🎯 Your First Auto-Pilot!" : "🎯 Your New Automation",
            description: k
              ? "Boom! Here's your automation — it runs daily at 9 AM.\n\n• Toggle it on/off with the switch\n• Delete it with the trash icon\n• The schedule and agent are shown at the bottom"
              : "Here's your new automation! It shows:\n\n• Name and description\n• On/off toggle switch\n• Delete button (trash icon)\n• Schedule and which agent runs it",
            side: "right" as const,
            align: "start" as const,
          },
        },
        // ── Transition to Calendar ──
        {
          element: '[data-tour="calendar"]',
          popover: {
            title: k ? "🏁 Next Stop: Race Schedule" : "Next: Calendar →",
            description: k
              ? "Let's check the race schedule — events, cron jobs, and your Google Calendar."
              : "Let's look at your calendar — events, scheduled tasks, and Google Calendar integration.",
            side: "right" as const,
            align: "center" as const,
          },
        },
      ],
    },

    // ══════════════════════════════════════
    // Phase 4: Calendar (/calendar)
    // ══════════════════════════════════════
    {
      path: "/calendar",
      steps: [
        {
          element: '[data-tour="calendar-connect"]',
          popover: {
            title: k ? "🔌 Pit Lane Link" : "🔗 Connect Google Calendar",
            description: k
              ? "Plug in your Google Calendar to see all your races — uh, events — right here.\n\nOnce connected, events sync automatically."
              : "Connect your Google Calendar to sync events. Once connected, your schedule appears here automatically.\n\nHarv can help you plan around your events.",
            side: "left" as const,
            align: "center" as const,
          },
        },
        {
          element: '[data-tour="calendar-nav"]',
          popover: {
            title: k ? "🧭 Navigate the Track" : "🧭 Navigation",
            description: k
              ? "Use the arrows to jump between weeks or months. Hit \"Today\" to snap back to the current date."
              : "Navigate through your schedule — use the arrows to go forward or back, and \"Today\" to jump to the current date.",
            side: "bottom" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="calendar-view-toggle"]',
          popover: {
            title: k ? "📐 View Modes" : "📐 Switch Views",
            description: k
              ? "Month, week, day, or agenda — pick your favorite angle on the track."
              : "Toggle between month, week, day, and agenda views to see your schedule the way you prefer.",
            side: "bottom" as const,
            align: "center" as const,
          },
        },
        {
          element: '[data-tour="calendar-grid"]',
          popover: {
            title: k ? "🗓️ The Race Calendar" : "🗓️ Your Schedule",
            description: k
              ? "All your events laid out. Google Calendar events show in color, automated cron jobs show in cyan below."
              : "Your events displayed in calendar form. Google Calendar events appear in color, and automated background tasks show in cyan at the bottom.",
            side: "left" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="calendar-crons"]',
          popover: {
            title: k ? "⚙️ Background Pit Crew" : "⚙️ Background Tasks",
            description: k
              ? "These run automatically — System Health checks every 15 min, Heartbeat every 90 min, Medic on-demand when issues are found."
              : "Automated tasks that run in the background:\n\n• System Health — monitors every 15 min\n• Heartbeat — syncs data every 90 min\n• Medic — auto-repairs when issues are detected",
            side: "top" as const,
            align: "start" as const,
          },
        },
        // ── Transition to Files ──
        {
          element: '[data-tour="documents"]',
          popover: {
            title: k ? "🏁 Next Stop: The Garage" : "Next: Files →",
            description: k
              ? "Let's check the parts locker — where all your files and documents live."
              : "Let's look at your uploaded files and documents.",
            side: "right" as const,
            align: "center" as const,
          },
        },
      ],
    },

    // ══════════════════════════════════════
    // Phase 5: Files (/documents)
    // ══════════════════════════════════════
    {
      path: "/documents",
      steps: [
        {
          element: '[data-tour="docs-upload"]',
          popover: {
            title: k ? "📦 Load Up the Hauler" : "📤 Upload Files",
            description: k
              ? "Toss in PDFs, images, spreadsheets — anything I should know about. More data = faster laps."
              : "Upload documents for Harv to reference. PDFs, images, spreadsheets, and more.\n\nThe more context you give, the smarter Harv becomes.",
            side: "left" as const,
            align: "center" as const,
          },
        },
        {
          element: '[data-tour="docs-search"]',
          popover: {
            title: k ? "🔍 Scan the Parts" : "🔍 Search Files",
            description: k
              ? "Find any file fast. Search by name or description."
              : "Search your uploaded files by name or description. Hit the Search button or press Enter.",
            side: "bottom" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="docs-filters"]',
          popover: {
            title: k ? "🏷️ Sort by Type" : "🏷️ Filter by Type",
            description: k
              ? "Filter your parts by type — All, Docs, Sheets, Images, and more. Each shows a count."
              : "Filter files by type — All, Docs, Sheets, and more. Each tab shows how many files of that type you have.",
            side: "bottom" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="docs-view-toggle"]',
          popover: {
            title: k ? "👁️ Change the View" : "👁️ Grid or List",
            description: k
              ? "Switch between grid view (thumbnails) and list view (compact rows)."
              : "Toggle between grid view for visual browsing or list view for a compact overview.",
            side: "bottom" as const,
            align: "end" as const,
          },
        },
        {
          element: '[data-tour="docs-grid"]',
          popover: {
            title: k ? "🗂️ The Parts Locker" : "🗂️ Your Files",
            description: k
              ? "All your uploaded blueprints and docs. Hover over any file to download or delete it.\n\nFiles uploaded by agents show which agent created them."
              : "All your uploaded documents. Hover over any file card to see download and delete options.\n\nFiles created by agents will show which agent uploaded them.",
            side: "left" as const,
            align: "start" as const,
          },
        },
        // ── Transition to Projects ──
        {
          element: '[data-tour="projects"]',
          popover: {
            title: k ? "🏁 Next Stop: Race Tracks" : "Next: Projects →",
            description: k
              ? "Let's check out the race tracks — where you organize work into separate projects."
              : "Let's look at Projects — where you organize conversations and files into groups.",
            side: "right" as const,
            align: "center" as const,
          },
        },
      ],
    },

    // ══════════════════════════════════════
    // Phase 6: Projects (/projects)
    // ══════════════════════════════════════
    {
      path: "/projects",
      steps: [
        {
          element: '[data-tour="projects-new-button"]',
          popover: {
            title: k ? "🏁 New Race Track" : "➕ Create a Project",
            description: k
              ? "Start a new track — each one gets its own chats, files, and context. Keep your races separate."
              : "Create a new project to organize related work. Each project gets its own conversations and files.",
            side: "left" as const,
            align: "center" as const,
          },
        },
        {
          element: '[data-tour="projects-search"]',
          popover: {
            title: k ? "🔍 Find Your Track" : "🔍 Search Projects",
            description: k
              ? "Quick search to jump to any track in your lineup."
              : "Search across all your projects by name.",
            side: "bottom" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="projects-grid"]',
          popover: {
            title: k ? "🏟️ All Your Tracks" : "📂 All Projects",
            description: k
              ? "Every race track you've set up. Use the three-dot menu on any card to delete a project."
              : "All your projects at a glance. Hover over any card to see the menu button (⋯) for options like delete.",
            side: "top" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="project-card-first"]',
          popover: {
            title: k ? "🏎️ Inside a Track" : "📂 Project Card",
            description: k
              ? "Each track shows its name, description, and stats — how many chats, files, and when it was last active.\n\nClick any card to open that project."
              : "Each project card shows:\n\n• Project name and description\n• Number of chats and files\n• Last activity timestamp\n\nClick any card to open that project.",
            side: "right" as const,
            align: "start" as const,
          },
        },
        // ── Transition to Settings ──
        {
          element: '[data-tour="settings"]',
          popover: {
            title: k ? "🏁 Final Stop: Tuning" : "Next: Settings →",
            description: k
              ? "Last stop — let's check the tuning shop where you customize everything."
              : "Almost done! Let's take a quick look at Settings to wrap up.",
            side: "right" as const,
            align: "center" as const,
          },
        },
      ],
    },

    // ══════════════════════════════════════
    // Phase 7: Settings (/settings)
    // ══════════════════════════════════════
    {
      path: "/settings",
      steps: [
        {
          element: '[data-tour="settings-tabs"]',
          popover: {
            title: k ? "🔧 The Tuning Menu" : "⚙️ Settings Tabs",
            description: k
              ? "Seven tabs of tuning options — appearance, integrations, API keys, billing, usage, account, and system."
              : "Navigate between settings sections:\n\n• General — theme & timezone\n• Integrations — Google, Telegram, etc.\n• Billing — plans & upgrades\n• Account — profile & tour restart",
            side: "right" as const,
            align: "start" as const,
          },
        },
        {
          element: '[data-tour="settings-theme"]',
          popover: {
            title: k ? "🎨 Paint Job" : "🎨 Appearance",
            description: k
              ? "Switch between light and dark themes. Dark mode is faster. That's just science."
              : "Toggle between light and dark themes. Your preference is saved automatically.",
            side: "right" as const,
            align: "center" as const,
          },
        },
        {
          popover: {
            title: k ? "🏁 Green Flag! You're Ready!" : "You're All Set! 🚀",
            description: k
              ? "Lights out and away we go!\n\n1. Head to Chat and say hi\n2. Ask me to do something awesome\n3. Explore the Crew Chiefs\n\nYou can restart this tour anytime from Settings → Account.\n\nI am speed. Ka-chow! ⚡"
              : "That's the full tour!\n\n1. Head to Chat and say hi to Harv\n2. Try asking him to help with something\n3. Explore the Agents page\n\nYou can restart this tour anytime from Settings → Account.\n\nHarv is here to make your life easier!",
          },
        },
      ],
    },
  ];
}

export function getTourPhases(isKachow: boolean): TourPhase[] {
  return makePhases(isKachow);
}

export function getTotalStepCount(isKachow: boolean): number {
  return makePhases(isKachow).reduce((sum, phase) => sum + phase.steps.length, 0);
}
