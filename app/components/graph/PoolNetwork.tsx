"use client";

// The pool map: every pool is a hub with its reports around it, coloured by outcome. A reporter who
// has filed on more than one pool links those pools with a dashed line. Drawn from the same public
// data as the rest of the site; nothing here is private.
import Link from "next/link";
import { useAccount } from "wagmi";
import { usePools, useReports } from "@/lib/api";
import { Status } from "@/lib/eip712";
import { formatUsdc } from "@/lib/format";
import type { PoolView, ReportView } from "@/lib/types";
import { Empty, Loading, Notice } from "../ui";
import { StatusNode } from "./StatusNode";

const CELL_W = 300;
const CELL_H = 250;
const HUB_R = 30;
const RING_R = 84;
const NODE_R = 8;
// More than this around one hub stops being readable; the rest are counted in the label.
const MAX_SHOWN = 18;

const statusName: Record<number, string> = {
  [Status.Submitted]: "waiting for the maintainer",
  [Status.Acknowledged]: "acknowledged",
  [Status.Valid]: "valid",
  [Status.Mistake]: "honest mistake",
  [Status.Slop]: "slop",
  [Status.Refunded]: "refunded",
};

function ReportNode({ r, x, y, mine }: { r: ReportView; x: number; y: number; mine: boolean }) {
  return (
    <Link href={`/report/${r.id}`}>
      <g transform={`translate(${x} ${y})`}>
        <title>{`Report #${r.id}: ${statusName[r.status] ?? "unknown"}`}</title>
        {mine && <circle r={NODE_R + 4} className="fill-none stroke-brand" strokeWidth={1.5} strokeDasharray="3 2" />}
        <StatusNode status={r.status} r={NODE_R} />
      </g>
    </Link>
  );
}

export function PoolNetworkGraph() {
  const pools = usePools();
  const reports = useReports({});
  const { address } = useAccount();
  const me = address?.toLowerCase();

  if (pools.isLoading || reports.isLoading) return <Loading />;
  if (pools.error || reports.error) return <Notice tone="slashed">Could not load the map: {(pools.error ?? reports.error)!.message}</Notice>;
  const list: PoolView[] = pools.data?.pools ?? [];
  if (!list.length) return <Empty>No pools yet.</Empty>;

  const cols = Math.min(list.length, 5);
  const rows = Math.ceil(list.length / cols);
  const width = cols * CELL_W;
  const height = rows * CELL_H;

  // Where each hub and each shown report sits.
  const hubAt = new Map<number, { x: number; y: number }>();
  const placed: { r: ReportView; x: number; y: number; hub: { x: number; y: number } }[] = [];
  const hidden = new Map<number, number>();
  list.forEach((p, i) => {
    const hub = { x: (i % cols) * CELL_W + CELL_W / 2, y: Math.floor(i / cols) * CELL_H + CELL_H / 2 - 12 };
    hubAt.set(p.id, hub);
    const mine = (reports.data?.reports ?? []).filter((r) => r.poolId === p.id).sort((a, b) => a.id - b.id);
    const shown = mine.slice(-MAX_SHOWN);
    hidden.set(p.id, mine.length - shown.length);
    shown.forEach((r, k) => {
      const angle = (2 * Math.PI * k) / shown.length - Math.PI / 2;
      placed.push({ r, x: hub.x + RING_R * Math.cos(angle), y: hub.y + RING_R * Math.sin(angle), hub });
    });
  });

  // One link per reporter between each pair of neighbouring pools they filed on.
  const byReporter = new Map<string, typeof placed>();
  for (const n of placed) byReporter.set(n.r.reporter, [...(byReporter.get(n.r.reporter) ?? []), n]);
  const links: { from: (typeof placed)[number]; to: (typeof placed)[number]; mine: boolean }[] = [];
  for (const [reporter, nodes] of byReporter) {
    const firstPerPool = [...new Map(nodes.map((n) => [n.r.poolId, n])).values()];
    for (let i = 1; i < firstPerPool.length; i++) links.push({ from: firstPerPool[i - 1], to: firstPerPool[i], mine: reporter === me });
  }

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} style={{ minWidth: Math.min(width, 560) }} className="mx-auto w-full" role="img" aria-label="Map of pools and their reports">
        {links.map(({ from, to, mine }) => (
          <path
            key={`${from.r.id}-${to.r.id}`}
            d={`M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 - 40} ${to.x} ${to.y}`}
            className={mine ? "fill-none stroke-brand" : "edge edge-dashed"}
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
        ))}
        {placed.map(({ r, x, y, hub }) => (
          <line key={`e${r.id}`} x1={hub.x} y1={hub.y} x2={x} y2={y} className="edge" />
        ))}
        {list.map((p) => {
          const hub = hubAt.get(p.id)!;
          const more = hidden.get(p.id) ?? 0;
          return (
            <Link key={p.id} href={`/pool/${p.id}`}>
              <g transform={`translate(${hub.x} ${hub.y})`}>
                <title>{`${p.repoName ?? `Pool #${p.id}`}: ${formatUsdc(BigInt(p.available))} available`}</title>
                <circle r={HUB_R} className="fill-brand" />
                <text textAnchor="middle" dy={4} className="num fill-white text-[11px] font-semibold">
                  {formatUsdc(BigInt(p.available), false)}
                </text>
                <text textAnchor="middle" y={RING_R + 26} className="fill-ink text-[12px] font-semibold">
                  {p.repoName ?? `Pool #${p.id}`}
                </text>
                {more > 0 && (
                  <text textAnchor="middle" y={RING_R + 42} className="fill-ink-muted text-[10px]">
                    and {more} earlier
                  </text>
                )}
              </g>
            </Link>
          );
        })}
        {placed.map(({ r, x, y }) => (
          <ReportNode key={r.id} r={r} x={x} y={y} mine={r.reporter === me} />
        ))}
      </svg>
    </div>
  );
}
