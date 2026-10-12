"use client";

// Per-pool report map: reports orbit the pool hub, the further out the longer they've waited. A dashed
// ring marks the deadline — past it without a verdict, the deposit is refundable.
import Link from "next/link";
import { useNow } from "@/lib/useNow";
import { Status } from "@/lib/eip712";
import type { PoolView, ReportView } from "@/lib/types";
import { formatDuration } from "@/lib/format";
import { Empty } from "../ui";
import { StatusNode } from "./StatusNode";

const SIZE = 440;
const CENTER = SIZE / 2;
const HUB_R = 32;
const R_MIN = HUB_R + 24;
const R_MAX = 190;
const NODE_R = 9;
// Reports past 1.5x the deadline are drawn at the same outer edge; further placement adds no information.
const HORIZON = 1.5;
// The deadline ring always sits at this fraction of the way out, since distance is normalized to HORIZON x the timeout.
const DEADLINE_FRACTION = 1 / HORIZON;

const legend: { status: number; label: string }[] = [
  { status: Status.Valid, label: "Valid" },
  { status: Status.Mistake, label: "Mistake" },
  { status: Status.Slop, label: "Slop" },
  { status: Status.Refunded, label: "Refunded" },
  { status: Status.Submitted, label: "Waiting" },
  { status: Status.Acknowledged, label: "Acknowledged" },
];

export function ReportConstellation({ pool, reports }: { pool: PoolView; reports: ReportView[] }) {
  const now = useNow();
  if (!reports.length) return <Empty>No reports yet.</Empty>;

  const deadlineRing = R_MIN + DEADLINE_FRACTION * (R_MAX - R_MIN);
  const placed = reports.map((r, i) => {
    const angle = (2 * Math.PI * i) / reports.length - Math.PI / 2;
    const elapsedDays = Math.max(0, now - r.createdAt) / 86_400;
    const horizonDays = (pool.timeout / 86_400) * HORIZON;
    const frac = horizonDays > 0 ? Math.min(elapsedDays, horizonDays) / horizonDays : 0;
    const dist = R_MIN + frac * (R_MAX - R_MIN);
    return { r, x: CENTER + dist * Math.cos(angle), y: CENTER + dist * Math.sin(angle) };
  });

  return (
    <div className="space-y-3">
      <div className="graph-canvas overflow-hidden rounded-2xl">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="mx-auto block h-auto w-full max-w-md"
          role="img"
          aria-label={`${reports.length} reports around this pool; the further out, the longer they've waited`}
        >
          <circle cx={CENTER} cy={CENTER} r={deadlineRing} className="constellation-ring" />
          <text x={CENTER} y={CENTER - deadlineRing - 8} textAnchor="middle" className="edge-tag" fill="var(--ink-muted)">
            {formatDuration(pool.timeout).toUpperCase()} DEADLINE
          </text>
          {placed.map(({ r, x, y }) => (
            <line key={`e${r.id}`} x1={CENTER} y1={CENTER} x2={x} y2={y} className="edge" />
          ))}
          <circle cx={CENTER} cy={CENTER} r={HUB_R} className="node-hub" />
          {placed.map(({ r, x, y }) => (
            <Link key={r.id} href={`/report/${r.id}`}>
              <g transform={`translate(${x} ${y})`}>
                <title>{`Report #${r.id}`}</title>
                <StatusNode status={r.status} r={NODE_R} />
              </g>
            </Link>
          ))}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>
              <g transform="translate(6 6)">
                <StatusNode status={l.status} r={5} />
              </g>
            </svg>
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
