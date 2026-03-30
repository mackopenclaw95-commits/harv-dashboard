import type { Agent } from "./agent-data";
import { SUB_AGENT_MAP, COMING_SOON_AGENTS } from "./agent-data";

export interface PositionedNode {
  agent: Agent;
  x: number;
  y: number;
  width: number;
  height: number;
  level: number;
  parentName?: string;
  groupLabel?: string;
}

export interface Edge {
  from: string;
  to: string;
  color: string;
  fromPos: { x: number; y: number };
  toPos: { x: number; y: number };
}

const NODE_W = 140;
const NODE_H = 76;
const ROOT_W = 170;
const ROOT_H = 86;
const H_GAP = 28;
const V_GAP = 90;

const ALL_SUB_AGENTS = new Set(Object.values(SUB_AGENT_MAP).flat());

function edgeColor(type: string): string {
  switch (type) {
    case "agent": return "rgba(59, 130, 246, 0.35)";
    case "tool": return "rgba(168, 85, 247, 0.35)";
    case "background": return "rgba(249, 115, 22, 0.35)";
    default: return "rgba(100, 116, 139, 0.25)";
  }
}

/**
 * Lay out a group of agents as a centered column with maxPerRow items per row.
 * Returns nodes positioned relative to a given centerX and startY.
 */
function layoutGroup(
  agents: Agent[],
  centerX: number,
  startY: number,
  maxPerRow: number,
): PositionedNode[] {
  const nodes: PositionedNode[] = [];
  const totalW = NODE_W + H_GAP;

  agents.forEach((agent, i) => {
    const row = Math.floor(i / maxPerRow);
    const col = i % maxPerRow;
    const itemsInRow = Math.min(agents.length - row * maxPerRow, maxPerRow);
    const rowWidth = itemsInRow * totalW - H_GAP;
    const rowStartX = centerX - rowWidth / 2;

    nodes.push({
      agent,
      x: rowStartX + col * totalW,
      y: startY + row * (NODE_H + 24),
      width: NODE_W,
      height: NODE_H,
      level: 2,
    });
  });

  return nodes;
}

/** Get height of a group layout */
function groupHeight(count: number, maxPerRow: number): number {
  const rows = Math.ceil(count / maxPerRow);
  return rows * (NODE_H + 24) - 24;
}

/** Get width of a group layout */
function groupWidth(count: number, maxPerRow: number): number {
  const cols = Math.min(count, maxPerRow);
  return cols * (NODE_W + H_GAP) - H_GAP;
}

export function computeLayout(agents: Agent[]): {
  nodes: PositionedNode[];
  edges: Edge[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
} {
  const nodes: PositionedNode[] = [];
  const edges: Edge[] = [];

  const harv = agents.find((a) => a.name === "Harv");
  const router = agents.find((a) => a.name === "Router");

  // Categorize — separate agents with sub-agents from regular agents
  const parentsWithSubs = Object.keys(SUB_AGENT_MAP);
  const activeAgents = agents.filter(
    (a) => a.type === "agent" && a.name !== "Harv" && a.name !== "Router" &&
      !COMING_SOON_AGENTS.has(a.name) && !ALL_SUB_AGENTS.has(a.name) &&
      !parentsWithSubs.includes(a.name)
  );
  const orchestrators = agents.filter((a) => parentsWithSubs.includes(a.name));
  const tools = agents.filter((a) => a.type === "tool");
  const background = agents.filter((a) => a.type === "background");
  const comingSoon = agents.filter((a) => COMING_SOON_AGENTS.has(a.name));

  // ─── Layout structure ───
  // Level 0: Harv (centered)
  // Level 1: Router (centered below Harv)
  // Level 2: Four groups spread horizontally:
  //   Left: Active Agents (3 per row)
  //   Center-left: Orchestrators + their sub-agents (vertical trees)
  //   Center-right: Tools + Background (stacked)
  //   Right: Coming Soon (2 per row)

  // Calculate group widths
  const activeW = groupWidth(activeAgents.length, 3);
  const orchW = Math.max(...orchestrators.map((o) => {
    const subs = SUB_AGENT_MAP[o.name] || [];
    return groupWidth(subs.length, 3);
  }), NODE_W) + 40;
  const totalOrchW = orchestrators.length * orchW + (orchestrators.length - 1) * 20;
  const toolsBgW = Math.max(groupWidth(tools.length, 3), groupWidth(background.length, 3));
  const comingSoonW = groupWidth(comingSoon.length, 2);

  const sectionGap = 70;
  const sections = [
    { w: activeW, label: "Active Agents" },
    { w: totalOrchW, label: "Orchestrators" },
    { w: toolsBgW, label: "Tools & Background" },
    { w: comingSoonW, label: "Coming Soon" },
  ];
  const totalWidth = sections.reduce((s, sec) => s + sec.w, 0) + (sections.length - 1) * sectionGap;
  const centerX = totalWidth / 2;

  // ─── Level 0: Harv ───
  const harvNode: PositionedNode = {
    agent: harv || { name: "Harv", status: "LIVE", model: "claude-haiku-4-5", type: "agent", tier: "AGENTS", provider: "anthropic", description: "Main brain", cost_per_call: 0 },
    x: centerX - ROOT_W / 2,
    y: 40,
    width: ROOT_W,
    height: ROOT_H,
    level: 0,
  };
  nodes.push(harvNode);

  // ─── Level 1: Router ───
  const routerNode: PositionedNode = {
    agent: router || { name: "Router", status: "LIVE", model: "qwen3-8b", type: "agent", tier: "AGENTS", provider: "openrouter", description: "Task classifier", cost_per_call: 0 },
    x: centerX - ROOT_W / 2,
    y: harvNode.y + ROOT_H + V_GAP,
    width: ROOT_W,
    height: ROOT_H,
    level: 1,
  };
  nodes.push(routerNode);

  edges.push({
    from: "Harv", to: "Router",
    color: "rgba(45, 212, 191, 0.5)",
    fromPos: { x: harvNode.x + ROOT_W / 2, y: harvNode.y + ROOT_H },
    toPos: { x: routerNode.x + ROOT_W / 2, y: routerNode.y },
  });

  const level2Y = routerNode.y + ROOT_H + V_GAP + 20;
  let sectionX = 0;

  // ─── Section 1: Active Agents ───
  const activeCenterX = sectionX + activeW / 2;
  const activeNodes = layoutGroup(activeAgents, activeCenterX, level2Y, 3);
  activeNodes.forEach((n) => {
    n.groupLabel = "Active Agents";
    nodes.push(n);
    edges.push({
      from: "Router", to: n.agent.name,
      color: edgeColor("agent"),
      fromPos: { x: routerNode.x + ROOT_W / 2, y: routerNode.y + ROOT_H },
      toPos: { x: n.x + NODE_W / 2, y: n.y },
    });
  });
  sectionX += activeW + sectionGap;

  // ─── Section 2: Orchestrators with sub-agents ───
  let orchX = sectionX;
  orchestrators.forEach((orch) => {
    const subs = SUB_AGENT_MAP[orch.name] || [];
    const subsWidth = groupWidth(subs.length, 3);
    const thisOrchW = Math.max(subsWidth, NODE_W) + 40;
    const orchCenterX = orchX + thisOrchW / 2;

    // Parent node
    const orchNode: PositionedNode = {
      agent: orch,
      x: orchCenterX - NODE_W / 2,
      y: level2Y,
      width: NODE_W,
      height: NODE_H,
      level: 2,
      groupLabel: "Orchestrators",
    };
    nodes.push(orchNode);
    edges.push({
      from: "Router", to: orch.name,
      color: edgeColor("agent"),
      fromPos: { x: routerNode.x + ROOT_W / 2, y: routerNode.y + ROOT_H },
      toPos: { x: orchNode.x + NODE_W / 2, y: orchNode.y },
    });

    // Sub-agent children
    const childAgents = subs
      .map((name) => agents.find((a) => a.name === name))
      .filter(Boolean) as Agent[];

    if (childAgents.length > 0) {
      const childY = orchNode.y + NODE_H + 60;
      const childNodes = layoutGroup(childAgents, orchCenterX, childY, 3);
      childNodes.forEach((cn) => {
        cn.level = 3;
        cn.parentName = orch.name;
        cn.groupLabel = orch.name + " sub-agents";
        nodes.push(cn);
        edges.push({
          from: orch.name, to: cn.agent.name,
          color: edgeColor(cn.agent.type),
          fromPos: { x: orchNode.x + NODE_W / 2, y: orchNode.y + NODE_H },
          toPos: { x: cn.x + NODE_W / 2, y: cn.y },
        });
      });
    }

    orchX += thisOrchW + 20;
  });
  sectionX += totalOrchW + sectionGap;

  // ─── Section 3: Tools & Background (stacked vertically) ───
  const tbCenterX = sectionX + toolsBgW / 2;

  // Tools
  const toolNodes = layoutGroup(tools, tbCenterX, level2Y, 3);
  toolNodes.forEach((n) => {
    n.groupLabel = "Tools";
    nodes.push(n);
    edges.push({
      from: "Router", to: n.agent.name,
      color: edgeColor("tool"),
      fromPos: { x: routerNode.x + ROOT_W / 2, y: routerNode.y + ROOT_H },
      toPos: { x: n.x + NODE_W / 2, y: n.y },
    });
  });

  // Background — below tools
  const bgY = level2Y + groupHeight(tools.length, 3) + 50;
  const bgNodes = layoutGroup(background, tbCenterX, bgY, 3);
  bgNodes.forEach((n) => {
    n.groupLabel = "Background";
    nodes.push(n);
    edges.push({
      from: "Router", to: n.agent.name,
      color: edgeColor("background"),
      fromPos: { x: routerNode.x + ROOT_W / 2, y: routerNode.y + ROOT_H },
      toPos: { x: n.x + NODE_W / 2, y: n.y },
    });
  });
  sectionX += toolsBgW + sectionGap;

  // ─── Section 4: Coming Soon ───
  const csCenterX = sectionX + comingSoonW / 2;
  const csNodes = layoutGroup(comingSoon, csCenterX, level2Y, 2);
  csNodes.forEach((n) => {
    n.groupLabel = "Coming Soon";
    nodes.push(n);
    // No edge from Router — these aren't connected yet
  });

  // ─── Compute bounds ───
  const pad = 60;
  const minX = Math.min(...nodes.map((n) => n.x)) - pad;
  const minY = Math.min(...nodes.map((n) => n.y)) - pad;
  const maxX = Math.max(...nodes.map((n) => n.x + n.width)) + pad;
  const maxY = Math.max(...nodes.map((n) => n.y + n.height)) + pad;

  return { nodes, edges, bounds: { minX, minY, maxX, maxY } };
}
