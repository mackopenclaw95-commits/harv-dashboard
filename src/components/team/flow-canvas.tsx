"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { computeLayout } from "@/lib/team-layout";
import type { Agent } from "@/lib/agent-data";
import { FlowNode } from "./flow-node";
import { FlowEdge } from "./flow-edge";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

interface FlowCanvasProps {
  agents: Agent[];
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent | null) => void;
}

export function FlowCanvas({ agents, selectedAgent, onSelectAgent }: FlowCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const { nodes, edges, bounds } = computeLayout(agents);

  // Auto-fit on mount
  useEffect(() => {
    fitView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.length]);

  const fitView = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const bw = bounds.maxX - bounds.minX;
    const bh = bounds.maxY - bounds.minY;

    if (bw === 0 || bh === 0) return;

    const scale = Math.max(0.45, Math.min(cw / bw, ch / bh, 1.2) * 0.85);
    const x = (cw - bw * scale) / 2 - bounds.minX * scale;
    const y = Math.max(20, (ch - bh * scale) / 2 - bounds.minY * scale);

    setTransform({ x, y, scale });
  }, [bounds]);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => {
      const newScale = Math.max(0.2, Math.min(2.5, t.scale * delta));
      // Zoom toward cursor position
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { ...t, scale: newScale };
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      return {
        scale: newScale,
        x: mx - (mx - t.x) * (newScale / t.scale),
        y: my - (my - t.y) * (newScale / t.scale),
      };
    });
  }, []);

  // Pan handlers
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [transform]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setTransform((t) => ({ ...t, x: dragStart.current.tx + dx, y: dragStart.current.ty + dy }));
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Check if an edge connects to the hovered or selected node
  const isEdgeHighlighted = (edge: { from: string; to: string }) => {
    const target = hoveredNode || selectedAgent?.name;
    if (!target) return false;
    return edge.from === target || edge.to === target;
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden"
      style={{ cursor: isDragging ? "grabbing" : "grab" }}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={() => onSelectAgent(null)}
    >
      {/* Zoom controls */}
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5">
        <button
          onClick={(e) => { e.stopPropagation(); setTransform((t) => ({ ...t, scale: Math.min(2.5, t.scale * 1.2) })); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-card/60 backdrop-blur-xl ring-1 ring-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          title="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setTransform((t) => ({ ...t, scale: Math.max(0.2, t.scale * 0.8) })); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-card/60 backdrop-blur-xl ring-1 ring-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          title="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); fitView(); }}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-card/60 backdrop-blur-xl ring-1 ring-white/[0.08] text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          title="Fit view"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* SVG Canvas */}
      <svg
        width="100%"
        height="100%"
        style={{ position: "absolute", top: 0, left: 0 }}
      >
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Edges (rendered first, behind nodes) */}
          {edges.map((edge) => (
            <FlowEdge
              key={`${edge.from}-${edge.to}`}
              edge={edge}
              highlighted={isEdgeHighlighted(edge)}
            />
          ))}

          {/* Nodes */}
          {nodes.map((node) => (
            <FlowNode
              key={node.agent.name}
              node={node}
              isSelected={selectedAgent?.name === node.agent.name}
              isHovered={hoveredNode === node.agent.name}
              onSelect={() => onSelectAgent(node.agent)}
              onHover={(h) => setHoveredNode(h ? node.agent.name : null)}
            />
          ))}
        </g>
      </svg>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3 px-3 py-2 rounded-xl bg-card/60 backdrop-blur-xl ring-1 ring-white/[0.08] text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Live</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-500" /> Idle</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> Error</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-500" /> Planned</span>
      </div>
    </div>
  );
}
