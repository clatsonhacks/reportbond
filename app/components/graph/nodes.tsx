"use client";

import { Status } from "@/lib/eip712";
import { formatUsdc } from "@/lib/format";
import type { ReactNode } from "react";

type NodeSize = "sm" | "md" | "lg" | "xl";

const sizes: Record<NodeSize, { node: string; text: string; px: number }> = {
  sm: { node: "h-6 w-6", text: "text-[8px]", px: 24 },
  md: { node: "h-10 w-10", text: "text-xs", px: 40 },
  lg: { node: "h-14 w-14", text: "text-sm", px: 56 },
  xl: { node: "h-20 w-20", text: "text-base", px: 80 },
};

interface HubNodeProps {
  size?: NodeSize;
  balance?: bigint;
  selected?: boolean;
  label?: string;
  onClick?: () => void;
}

/**
 * Hub Node - represents a pool
 * Sized by balance, gradient core (brand indigo → sky glow)
 */
export function HubNode({ size = "lg", balance, selected, label, onClick }: HubNodeProps) {
  const s = sizes[size];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        graph-node node-hub relative flex items-center justify-center
        ${s.node}
        ${selected ? "node-selected node-halo" : ""}
        ${onClick ? "cursor-pointer hover:scale-105" : "cursor-default"}
      `}
      aria-label={label ?? "Pool"}
    >
      {balance !== undefined && (
        <span className={`num font-semibold text-white ${s.text}`}>
          {formatUsdc(balance)}
        </span>
      )}
    </button>
  );
}

interface SatelliteNodeProps {
  status: number;
  size?: NodeSize;
  selected?: boolean;
  label?: string;
  bounty?: bigint;
  onClick?: () => void;
}

const statusStyles: Record<number, string> = {
  [Status.Submitted]: "node-waiting",
  [Status.Acknowledged]: "node-acknowledged",
  [Status.Valid]: "node-valid",
  [Status.Mistake]: "node-mistake",
  [Status.Slop]: "node-slop",
  [Status.Refunded]: "node-refunded",
};

const statusIcons: Record<number, ReactNode> = {
  [Status.Slop]: (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
      <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  [Status.Valid]: (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/**
 * Satellite Node - represents a report orbiting a pool
 * Status determines fill: hollow (waiting), dot (acknowledged), filled (resolved)
 */
export function SatelliteNode({ status, size = "md", selected, label, bounty, onClick }: SatelliteNodeProps) {
  const s = sizes[size];
  const statusCls = statusStyles[status] ?? "node-waiting";
  const icon = statusIcons[status];

  // Scale up valid nodes based on bounty
  const sizeClass = status === Status.Valid && bounty && bounty > 10n * 10n ** 18n ? sizes.lg.node : s.node;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        graph-node node-satellite relative flex items-center justify-center
        ${sizeClass} ${statusCls}
        ${selected ? "node-selected node-halo" : ""}
        ${onClick ? "cursor-pointer hover:scale-105" : "cursor-default"}
      `}
      aria-label={label ?? `Report (${status})`}
    >
      {icon}
    </button>
  );
}

interface ConnectorNodeProps {
  address: string;
  selected?: boolean;
  onClick?: () => void;
}

/**
 * Connector Node - represents a wallet linking reports across pools
 * Rounded rectangle with brand border
 */
export function ConnectorNode({ address, selected, onClick }: ConnectorNodeProps) {
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        graph-node node-connector
        ${selected ? "ring-2 ring-brand shadow-lg" : ""}
        ${onClick ? "cursor-pointer hover:border-brand-light" : "cursor-default"}
      `}
      aria-label={`Wallet ${short}`}
    >
      <span className="num text-xs text-ink-muted">{short}</span>
    </button>
  );
}

interface DraftNodeProps {
  size?: NodeSize;
  label?: string;
}

/**
 * Draft Node - represents an unsent report (dashed outline)
 * Used in the "Where your report lands" preview
 */
export function DraftNode({ size = "md", label }: DraftNodeProps) {
  const s = sizes[size];
  return (
    <div
      className={`
        graph-node relative flex items-center justify-center rounded-full
        ${s.node}
        border-2 border-dashed border-brand bg-brand-bg/50
      `}
      aria-label={label ?? "Draft report"}
    >
      <span className={`font-medium text-brand ${s.text}`}>+</span>
    </div>
  );
}

interface DeadlineRingProps {
  radius: number;
  className?: string;
}

/**
 * Deadline Ring - dashed circle around a pool showing the response timeout
 */
export function DeadlineRing({ radius, className = "" }: DeadlineRingProps) {
  const d = radius * 2;
  return (
    <svg
      width={d + 4}
      height={d + 4}
      viewBox={`0 0 ${d + 4} ${d + 4}`}
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${className}`}
    >
      <circle
        cx={d / 2 + 2}
        cy={d / 2 + 2}
        r={radius}
        className="deadline-ring"
      />
    </svg>
  );
}

interface KeeperBandProps {
  innerRadius: number;
  outerRadius: number;
  className?: string;
}

/**
 * Keeper Band - violet zone beyond the deadline ring
 * Reports here will be auto-refunded by the keeper
 */
export function KeeperBand({ innerRadius, outerRadius, className = "" }: KeeperBandProps) {
  const d = outerRadius * 2;
  return (
    <svg
      width={d + 4}
      height={d + 4}
      viewBox={`0 0 ${d + 4} ${d + 4}`}
      className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${className}`}
    >
      <defs>
        <mask id="keeper-ring">
          <circle cx={d / 2 + 2} cy={d / 2 + 2} r={outerRadius} fill="white" />
          <circle cx={d / 2 + 2} cy={d / 2 + 2} r={innerRadius} fill="black" />
        </mask>
      </defs>
      <circle
        cx={d / 2 + 2}
        cy={d / 2 + 2}
        r={outerRadius}
        className="keeper-band"
        mask="url(#keeper-ring)"
      />
    </svg>
  );
}
