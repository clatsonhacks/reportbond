"use client";

import Link from "next/link";
import { usePools, useStatus } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { Amount, Empty, Loading, Notice } from "./ui";
import { VerifiedBadge } from "./VerifiedBadge";
import type { Outcomes, PoolView } from "@/lib/types";

export type PoolSort = "bounty" | "response" | "bond";

/** The most one valid report can earn right now: the pool's cap, or what's left in it if that is less. */
const maxBounty = (p: PoolView) => (BigInt(p.maxPayout) < BigInt(p.available) ? BigInt(p.maxPayout) : BigInt(p.available));
const compare = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);
const sorters: Record<PoolSort, (a: PoolView, b: PoolView) => number> = {
  bounty: (a, b) => compare(maxBounty(b), maxBounty(a)),
  response: (a, b) => a.timeout - b.timeout,
  bond: (a, b) => compare(BigInt(a.depositAmount), BigInt(b.depositAmount)),
};

function TrackRecordBar({ record }: { record: Outcomes }) {
  const total = record.valid + record.mistake + record.slop + record.refunded;
  if (total === 0) return <span className="text-xs text-ink-muted">No history</span>;

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-surface">
        {record.valid > 0 && (
          <div
            className="bg-valid"
            style={{ width: `${(record.valid / total) * 100}%` }}
          />
        )}
        {record.mistake > 0 && (
          <div
            className="bg-mistake"
            style={{ width: `${(record.mistake / total) * 100}%` }}
          />
        )}
        {record.slop > 0 && (
          <div
            className="bg-slop"
            style={{ width: `${(record.slop / total) * 100}%` }}
          />
        )}
        {record.refunded > 0 && (
          <div
            className="bg-refunded"
            style={{ width: `${(record.refunded / total) * 100}%` }}
          />
        )}
      </div>
      <span className="text-xs text-ink-muted">
        {record.valid} of {total} resolved were valid
      </span>
    </div>
  );
}

export function PoolList({ creator, sort }: { creator?: string; sort?: PoolSort }) {
  const status = useStatus();
  const { data, isLoading, error } = usePools(creator);

  if (status.data && !status.data.deployed) {
    return <Notice tone="waiting">The contract is not deployed on {status.data.network} yet.</Notice>;
  }
  if (isLoading) return <Loading />;
  if (error) return <Notice tone="slashed">Could not load pools: {error.message}</Notice>;
  if (!data?.pools.length) return <Empty>{creator ? "You have not opened a pool yet." : "No pools yet."}</Empty>;

  return (
    <div className="flex gap-4 overflow-x-auto pb-2 -mx-2 px-2 snap-x">
      {(sort ? [...data.pools].sort(sorters[sort]) : data.pools).map((p) => (
        <Link
          key={p.id}
          href={creator ? `/maintainer/pool/${p.id}` : `/pool/${p.id}`}
          className="card-hover group block min-w-56 shrink-0 rounded-2xl border border-line bg-card p-4 state-change hover:border-brand/30 hover:shadow-lg snap-start"
        >
          {/* Header with repo name and pool badge */}
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-ink group-hover:text-brand state-change">
                {p.repoName ?? `Pool #${p.id}`}
              </h3>
              {p.verifiedBy && (
                <div className="mt-1">
                  <VerifiedBadge login={p.verifiedBy} />
                </div>
              )}
              {!p.acceptingReports && <p className="mt-1 text-xs text-waiting">Setting up: rules not published yet</p>}
            </div>
            <span className="rounded-md bg-surface px-2 py-0.5 text-xs font-medium text-ink-muted">
              Pool#{p.id}
            </span>
          </div>

          {/* Max bounty - prominent */}
          <div className="mb-4">
            <div className="text-xs uppercase tracking-wider text-ink-muted">Max bounty</div>
            <Amount value={maxBounty(p)} className="text-2xl font-bold" />
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-muted">Bond</div>
              <Amount value={p.depositAmount} className="text-sm font-semibold" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-muted">Balance</div>
              <Amount value={p.available} className="text-sm font-semibold" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-ink-muted">Responds in</div>
              <div className="text-sm font-semibold">{formatDuration(p.timeout)}</div>
            </div>
          </div>

          {/* Track record bar */}
          <div className="mt-3 border-t border-line pt-3">
            <TrackRecordBar record={p.outcomes} />
          </div>

          {/* Open reports badge for maintainer view */}
          {creator && p.openReports > 0 && (
            <div className="mt-3 flex items-center justify-end">
              <span className="rounded-full bg-waiting-bg px-2.5 py-0.5 text-xs font-medium text-waiting">
                {p.openReports} open
              </span>
            </div>
          )}
        </Link>
      ))}
    </div>
  );
}
