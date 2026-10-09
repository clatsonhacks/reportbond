"use client";

import Link from "next/link";
import { usePools, useStatus } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { Amount, Empty, Loading, Notice } from "./ui";
import { BugIcon } from "./icons";

export function PoolList({ creator }: { creator?: string }) {
  const status = useStatus();
  const { data, isLoading, error } = usePools(creator);

  if (status.data && !status.data.deployed) {
    return <Notice tone="waiting">The contract isn&apos;t deployed on {status.data.network} yet.</Notice>;
  }
  if (isLoading) return <Loading />;
  if (error) return <Notice tone="slashed">Couldn&apos;t load pools: {error.message}</Notice>;
  if (!data?.pools.length) return <Empty>{creator ? "You haven't opened a pool yet." : "No pools yet."}</Empty>;

  return (
    <ul className="grid gap-6 sm:grid-cols-2">
      {data.pools.map((p) => (
        <li key={p.id}>
          <Link
            href={creator ? `/maintainer/pool/${p.id}` : `/pool/${p.id}`}
            className="card-hover group block rounded-3xl border-2 border-line bg-card p-8 state-change hover:border-accent hover:shadow-xl"
          >
            {/* Bug Icon & Title */}
            <div className="mb-6 flex items-start justify-between">
              <div className="flex-1">
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-bold text-accent-ink">
                  <BugIcon className="h-3 w-3 text-accent-ink" />
                  POOL #{p.id}
                </div>
                <h3 className="mt-2 text-2xl font-black tracking-tight">
                  {p.repoName ?? <span className="text-ink-muted">Unnamed Repository</span>}
                </h3>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-ink group-hover:scale-110 state-change">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-surface p-4">
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-ink-muted">Deposit</div>
                <Amount value={p.depositAmount} className="text-2xl font-black" />
              </div>
              <div className="rounded-xl bg-returned-bg p-4">
                <div className="mb-1 text-xs font-bold uppercase tracking-wider text-returned">Bounty</div>
                <Amount value={p.available} className="text-2xl font-black text-returned" />
              </div>
            </div>

            {/* Footer Info */}
            <div className="mt-6 flex items-center justify-between border-t-2 border-line pt-4">
              <div className="flex items-center gap-2 text-xs font-medium text-ink-muted">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatDuration(p.timeout)}
              </div>
              {creator && p.openReports > 0 && (
                <div className="rounded-full bg-waiting-bg px-3 py-1 text-xs font-bold text-waiting">
                  {p.openReports} Open
                </div>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
