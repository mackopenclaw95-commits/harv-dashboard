"use client";

import Link from "next/link";
import { X, MessageSquare, Cpu, Globe, Layers, DollarSign, Clock, Zap } from "lucide-react";
import { AGENT_ICONS, NO_CHAT_AGENTS, statusColor, typeColor } from "@/lib/agent-data";
import type { Agent } from "@/lib/agent-data";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface DetailPanelProps {
  agent: Agent;
  onClose: () => void;
}

export function DetailPanel({ agent, onClose }: DetailPanelProps) {
  const Icon = AGENT_ICONS[agent.name] || Bot;
  const canChat = !NO_CHAT_AGENTS.has(agent.name);
  const modelShort = agent.model && agent.model !== "none" && agent.model !== "tbd"
    ? agent.model.split("/").pop()?.replace(/-\d{8}$/, "") || agent.model
    : null;

  return (
    <div className="absolute top-0 right-0 h-full w-[380px] z-20 border-l border-white/[0.06] bg-card/80 backdrop-blur-2xl shadow-2xl shadow-black/20 animate-in slide-in-from-right duration-300 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/20">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{agent.name}</h2>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", statusColor(agent.status))}>
                {agent.status}
              </Badge>
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", typeColor(agent.type))}>
                {agent.type}
              </Badge>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/[0.06] hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Description */}
      <div className="p-5 space-y-5">
        <p className="text-sm text-muted-foreground leading-relaxed">{agent.description}</p>

        {/* Details grid */}
        <div className="grid grid-cols-2 gap-3">
          {modelShort && (
            <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-1">
                <Cpu className="h-3 w-3" />
                Model
              </div>
              <p className="text-xs font-medium truncate">{modelShort}</p>
            </div>
          )}

          {agent.provider && agent.provider !== "none" && agent.provider !== "tbd" && (
            <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-1">
                <Globe className="h-3 w-3" />
                Provider
              </div>
              <p className="text-xs font-medium capitalize">{agent.provider}</p>
            </div>
          )}

          <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-3">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-1">
              <Layers className="h-3 w-3" />
              Tier
            </div>
            <p className="text-xs font-medium">{agent.tier}</p>
          </div>

          {agent.cost_per_call > 0 && (
            <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-3">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium mb-1">
                <DollarSign className="h-3 w-3" />
                Cost/Call
              </div>
              <p className="text-xs font-medium font-mono">${agent.cost_per_call.toFixed(4)}</p>
            </div>
          )}
        </div>

        {/* Last Event */}
        {agent.last_event && (
          <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60 uppercase tracking-wider font-medium">
              <Clock className="h-3 w-3" />
              Last Activity
            </div>
            <p className="text-xs font-medium">{agent.last_event.action}</p>
            <p className="text-xs text-muted-foreground line-clamp-3">{agent.last_event.summary}</p>
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              {agent.last_event.tokens > 0 && (
                <span className="flex items-center gap-1">
                  <Zap className="h-3 w-3" />
                  {agent.last_event.tokens.toLocaleString()} tokens
                </span>
              )}
              {agent.last_event.duration > 0 && (
                <span>{(agent.last_event.duration / 1000).toFixed(1)}s</span>
              )}
            </div>
          </div>
        )}

        {/* Chat button */}
        {canChat && (
          <Link
            href={`/agents/${encodeURIComponent(agent.name)}`}
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary text-sm font-medium transition-colors ring-1 ring-primary/20"
          >
            <MessageSquare className="h-4 w-4" />
            Chat with {agent.name}
          </Link>
        )}
      </div>
    </div>
  );
}
