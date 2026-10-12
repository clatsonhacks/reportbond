"use client";

// A radial countdown to the maintainer's response deadline, replacing a plain "X left" sentence with
// something that reads at a glance.
import { Status } from "@/lib/eip712";
import { formatDuration } from "@/lib/format";
import { useNow } from "@/lib/useNow";

const R = 52;
const CIRC = 2 * Math.PI * R;
const SIZE = 140;
const CENTER = SIZE / 2;

export function DeadlineRing({ createdAt, deadline, status }: { createdAt: number; deadline: number; status: number }) {
  const now = useNow(1000);
  const open = status === Status.Submitted || status === Status.Acknowledged;
  const total = Math.max(1, deadline - createdAt);
  const left = deadline - now;
  const fraction = open ? Math.max(0, Math.min(1, left / total)) : 0;

  const big = open ? (left > 0 ? formatDuration(left) : "Overdue") : status === Status.Refunded ? "Expired" : "Closed";
  const small = open ? (left > 0 ? `OF ${formatDuration(total).toUpperCase()}` : "PAST DEADLINE") : status === Status.Refunded ? "EXPIRED" : "RESOLVED";

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${big}, ${small.toLowerCase()}`}>
        <defs>
          <linearGradient id="deadline-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--brand)" />
            <stop offset="1" stopColor="var(--brand-glow)" />
          </linearGradient>
        </defs>
        <circle cx={CENTER} cy={CENTER} r={R} fill="none" stroke="var(--brand-bg)" strokeWidth={8} />
        <circle
          cx={CENTER}
          cy={CENTER}
          r={R}
          fill="none"
          stroke="url(#deadline-ring-grad)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${(CIRC * fraction).toFixed(1)} ${CIRC}`}
          transform={`rotate(-90 ${CENTER} ${CENTER})`}
        />
        <text x={CENTER} y={CENTER - 2} textAnchor="middle" className="text-lg font-bold" fill="var(--ink)">
          {big}
        </text>
        <text x={CENTER} y={CENTER + 18} textAnchor="middle" className="text-[10px] font-semibold tracking-wide" fill="var(--ink-muted)">
          {small}
        </text>
      </svg>
    </div>
  );
}
