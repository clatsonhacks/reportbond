"use client";

// A personal map: your wallet, your reports (chips, one per report), and the pool(s) they belong to.
// Different glyph language from the homepage's PoolNetworkGraph (chips, not dot-rings) — a handful of
// reports reads better as a short labelled list than as dots scattered around a hub.
import Link from "next/link";
import { usePools } from "@/lib/api";
import { statusLabel } from "@/components/StatusPill";
import { Status } from "@/lib/eip712";
import { formatUsdc } from "@/lib/format";
import type { ReportView } from "@/lib/types";
import { Empty, Loading, Notice } from "../ui";

const CHIP_W = 150;
const CHIP_H = 40;
const COL_GAP = 160;
const ROW_GAP = 56;
const PAD_Y = 30;

const chipTone: Record<number, string> = {
  [Status.Valid]: "fill-valid-bg stroke-valid",
  [Status.Mistake]: "fill-mistake-bg stroke-mistake",
  [Status.Slop]: "fill-slop-bg stroke-slop",
  [Status.Refunded]: "fill-refunded-bg stroke-refunded",
  [Status.Acknowledged]: "fill-acknowledged-bg stroke-acknowledged",
  [Status.Submitted]: "fill-waiting-bg stroke-waiting",
};

function outcomeText(r: ReportView): string {
  if (r.status === Status.Valid) return `+${formatUsdc(BigInt(r.deposit) + BigInt(r.bounty))}`;
  if (r.status === Status.Mistake || r.status === Status.Refunded) return `+${formatUsdc(BigInt(r.deposit))}`;
  if (r.status === Status.Slop) return formatUsdc(0n);
  return statusLabel(r.status);
}

export function MyReportNetwork({ reports }: { reports: ReportView[] }) {
  const pools = usePools();
  if (!reports.length) return <Empty>No reports yet.</Empty>;
  if (pools.isLoading) return <Loading />;
  if (pools.error) return <Notice tone="slashed">Could not load the map: {pools.error.message}</Notice>;

  const poolIds = [...new Set(reports.map((r) => r.poolId))];
  const height = PAD_Y * 2 + Math.max(reports.length, poolIds.length) * ROW_GAP;
  const walletX = 70;
  const reportX = walletX + COL_GAP;
  const poolX = reportX + COL_GAP;
  const reportY = (i: number) => PAD_Y + i * ROW_GAP + ROW_GAP / 2;
  const poolY = (i: number) => PAD_Y + i * (height / poolIds.length) + height / poolIds.length / 2 - PAD_Y / poolIds.length;
  const walletY = height / 2;

  return (
    <div className="graph-canvas overflow-hidden rounded-2xl">
      <svg viewBox={`0 0 ${poolX + 90} ${height}`} className="mx-auto block h-auto w-full max-w-2xl" role="img" aria-label="Your wallet, reports, and the pools they belong to">
        {reports.map((r, i) => {
          const pi = poolIds.indexOf(r.poolId);
          return (
            <g key={`e${r.id}`}>
              <path
                d={`M ${walletX + 14} ${walletY} C ${walletX + 70} ${walletY}, ${reportX - 70} ${reportY(i)}, ${reportX - CHIP_W / 2} ${reportY(i)}`}
                className="edge"
              />
              <path
                d={`M ${reportX + CHIP_W / 2} ${reportY(i)} C ${reportX + 70} ${reportY(i)}, ${poolX - 70} ${poolY(pi)}, ${poolX - 14} ${poolY(pi)}`}
                className="edge"
              />
            </g>
          );
        })}

        <g>
          <circle cx={walletX} cy={walletY} r={14} className="fill-ink" />
          <text x={walletX} y={walletY + 28} textAnchor="middle" className="text-[11px] font-semibold" fill="var(--ink)">
            You
          </text>
        </g>

        {reports.map((r, i) => (
          <Link key={r.id} href={`/report/${r.id}`}>
            <g transform={`translate(${reportX - CHIP_W / 2} ${reportY(i) - CHIP_H / 2})`}>
              <title>{`Report #${r.id}: ${statusLabel(r.status)}`}</title>
              <rect width={CHIP_W} height={CHIP_H} rx={12} className={chipTone[r.status] ?? "fill-card stroke-line"} strokeWidth={1.5} />
              <text x={CHIP_W / 2} y={16} textAnchor="middle" className="num text-[11px] font-semibold" fill="var(--ink)">
                #{r.id}
              </text>
              <text x={CHIP_W / 2} y={30} textAnchor="middle" className="num text-[10px]" fill="var(--ink-muted)">
                {outcomeText(r)}
              </text>
            </g>
          </Link>
        ))}

        {poolIds.map((poolId, i) => {
          const p = pools.data?.pools.find((p) => p.id === poolId);
          return (
            <Link key={poolId} href={`/pool/${poolId}`}>
              <g transform={`translate(${poolX} ${poolY(i)})`}>
                <title>{p?.repoName ?? `Pool #${poolId}`}</title>
                <circle r={20} className="node-hub" />
                <text textAnchor="middle" dy={36} className="text-[11px] font-semibold" fill="var(--ink)">
                  {p?.repoName ?? `Pool #${poolId}`}
                </text>
              </g>
            </Link>
          );
        })}
      </svg>
    </div>
  );
}
