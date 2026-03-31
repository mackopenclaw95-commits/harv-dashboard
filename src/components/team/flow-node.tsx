"use client";

import { AGENT_ICONS, statusDotColor, typeColor, COMING_SOON_AGENTS } from "@/lib/agent-data";
import type { PositionedNode } from "@/lib/team-layout";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlowNodeProps {
  node: PositionedNode;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHover: (hovering: boolean) => void;
}

export function FlowNode({ node, isSelected, isHovered, onSelect, onHover }: FlowNodeProps) {
  const { agent, width, height, level } = node;
  const Icon = AGENT_ICONS[agent.name] || Bot;
  const isRoot = level <= 1;
  const isPlanned = agent.status === "PLANNED";
  const isComingSoon = COMING_SOON_AGENTS.has(agent.name);

  return (
    <foreignObject
      x={node.x}
      y={node.y}
      width={width}
      height={height}
      className="overflow-visible"
    >
      <div
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        onMouseEnter={() => onHover(true)}
        onMouseLeave={() => onHover(false)}
        className={cn(
          "relative flex flex-col items-center justify-center gap-0.5 rounded-xl cursor-pointer select-none",
          "transition-all duration-200 border",
          (isPlanned || isComingSoon) ? "opacity-50 border-dashed border-slate-500/30" : "border-white/[0.06]",
          isSelected
            ? "bg-card/80 ring-2 ring-primary/50 shadow-lg shadow-primary/20 scale-105 border-primary/30"
            : isHovered
              ? "bg-card/70 ring-1 ring-primary/25 shadow-md shadow-primary/10 scale-[1.03] border-primary/20"
              : "bg-card/50 ring-1 ring-white/[0.08]",
        )}
        style={{ width, height }}
      >
        {/* Status dot — hide for coming soon / planned */}
        {!isComingSoon && !isPlanned && (
          <div className="absolute -top-1 -right-1 z-10">
            <span className={cn(
              "block h-2 w-2 rounded-full ring-[1.5px] ring-card",
              statusDotColor(agent.status),
            )} />
          </div>
        )}

        {/* Icon */}
        <div className={cn(
          "flex items-center justify-center rounded-lg mb-0.5",
          isRoot ? "h-7 w-7 bg-primary/15" : "h-5 w-5 bg-white/[0.06]",
        )}>
          <Icon className={cn(
            isRoot ? "h-4 w-4 text-primary" : "h-3 w-3 text-foreground/70",
          )} />
        </div>

        {/* Name */}
        <p className={cn(
          "font-semibold text-center leading-none",
          isRoot ? "text-[11px]" : "text-[9px]",
        )}>
          {agent.name}
        </p>

        {/* Type badge */}
        {isRoot && (
          <p className="text-[8px] text-muted-foreground mt-0.5">
            {level === 0 ? "Main Brain" : "Orchestrator"}
          </p>
        )}
        {!isRoot && (
          <span className={cn(
            "text-[7px] font-medium px-1.5 py-0 rounded-full border mt-0.5",
            typeColor(agent.type),
          )}>
            {agent.type}
          </span>
        )}
      </div>
    </foreignObject>
  );
}
