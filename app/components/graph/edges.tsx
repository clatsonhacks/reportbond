"use client";

import { formatUsdc } from "@/lib/format";

interface Point {
  x: number;
  y: number;
}

interface EdgeProps {
  from: Point;
  to: Point;
  className?: string;
}

/**
 * Standard edge - pale indigo, 1.5px
 */
export function Edge({ from, to, className = "" }: EdgeProps) {
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      className={`edge ${className}`}
    />
  );
}

/**
 * Dashed edge - for things not yet true (draft reports, pending actions)
 */
export function DashedEdge({ from, to, className = "" }: EdgeProps) {
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      className={`edge edge-dashed ${className}`}
    />
  );
}

interface MoneyEdgeProps extends EdgeProps {
  amount?: bigint;
  animated?: boolean;
}

/**
 * Money edge - thick indigo line with glow, carries funds
 */
export function MoneyEdge({ from, to, amount, animated, className = "" }: MoneyEdgeProps) {
  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        className={`edge-money ${animated ? "edge-payout" : ""} ${className}`}
      />
      {amount !== undefined && (
        <EdgeTag
          position={{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }}
          label={formatUsdc(amount)}
        />
      )}
    </g>
  );
}

interface PayoutEdgeProps extends EdgeProps {
  amount?: bigint;
}

/**
 * Payout edge - animated green dashed line showing money flowing to reporter
 */
export function PayoutEdge({ from, to, amount, className = "" }: PayoutEdgeProps) {
  return (
    <g>
      <line
        x1={from.x}
        y1={from.y}
        x2={to.x}
        y2={to.y}
        className={`edge-payout ${className}`}
      />
      {amount !== undefined && (
        <EdgeTag
          position={{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }}
          label={`+${formatUsdc(amount)}`}
          variant="success"
        />
      )}
    </g>
  );
}

interface CurvedEdgeProps {
  from: Point;
  to: Point;
  curve?: number;
  className?: string;
}

/**
 * Curved edge - for connecting nodes that would overlap with straight lines
 */
export function CurvedEdge({ from, to, curve = 50, className = "" }: CurvedEdgeProps) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  // Calculate perpendicular offset for control point
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / len;
  const ny = dx / len;

  const ctrlX = midX + nx * curve;
  const ctrlY = midY + ny * curve;

  return (
    <path
      d={`M ${from.x} ${from.y} Q ${ctrlX} ${ctrlY} ${to.x} ${to.y}`}
      className={`edge ${className}`}
    />
  );
}

interface EdgeTagProps {
  position: Point;
  label: string;
  variant?: "default" | "success" | "brand";
}

const tagVariants = {
  default: "bg-card border-line text-ink-muted",
  success: "bg-valid-bg border-valid/30 text-valid-text",
  brand: "bg-brand-bg border-brand/30 text-brand",
};

/**
 * Edge Tag - small label on an edge (e.g. "BOND 5.00")
 */
export function EdgeTag({ position, label, variant = "default" }: EdgeTagProps) {
  return (
    <foreignObject
      x={position.x - 30}
      y={position.y - 10}
      width={60}
      height={20}
    >
      <div className={`edge-tag text-center ${tagVariants[variant]}`}>
        {label}
      </div>
    </foreignObject>
  );
}

interface GraphContainerProps {
  width?: number;
  height?: number;
  children: React.ReactNode;
  className?: string;
}

/**
 * Graph Container - SVG wrapper with dotted background
 */
export function GraphContainer({ width = 400, height = 300, children, className = "" }: GraphContainerProps) {
  return (
    <div className={`graph-canvas rounded-2xl border border-line overflow-hidden ${className}`}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
      >
        {children}
      </svg>
    </div>
  );
}

interface GraphGroupProps {
  x?: number;
  y?: number;
  children: React.ReactNode;
}

/**
 * Graph Group - positioned group for nodes
 */
export function GraphGroup({ x = 0, y = 0, children }: GraphGroupProps) {
  return (
    <g transform={`translate(${x}, ${y})`}>
      {children}
    </g>
  );
}
