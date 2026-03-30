"use client";

import type { Edge } from "@/lib/team-layout";

interface FlowEdgeProps {
  edge: Edge;
  highlighted: boolean;
}

export function FlowEdge({ edge, highlighted }: FlowEdgeProps) {
  const { fromPos, toPos, color } = edge;

  // Cubic bezier — vertical connection with smooth curve
  const midY = (fromPos.y + toPos.y) / 2;
  const d = `M ${fromPos.x} ${fromPos.y} C ${fromPos.x} ${midY}, ${toPos.x} ${midY}, ${toPos.x} ${toPos.y}`;

  return (
    <g>
      {/* Glow layer */}
      {highlighted && (
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeOpacity={0.3}
          style={{ filter: "blur(4px)" }}
        />
      )}
      {/* Main path */}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={highlighted ? 2.5 : 1.5}
        strokeOpacity={highlighted ? 0.9 : 0.4}
        strokeLinecap="round"
        className="flow-edge"
        style={{ transition: "stroke-opacity 0.3s, stroke-width 0.3s" }}
      />
      {/* Animated dot traveling along the path */}
      {highlighted && (
        <circle r="3" fill={color} opacity={0.8}>
          <animateMotion dur="2s" repeatCount="indefinite" path={d} />
        </circle>
      )}
    </g>
  );
}
