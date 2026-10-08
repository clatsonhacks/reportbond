"use client";

import Link from "next/link";
import { usePools, useStatus } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { Amount, Empty, Loading, Notice } from "./ui";

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
    <ul className="divide-y divide-line rounded-[8px] border border-line bg-card">
      {data.pools.map((p) => (
        <li key={p.id}>
          <Link
            href={creator ? `/maintainer/pool/${p.id}` : `/pool/${p.id}`}
            className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-4 py-3 hover:bg-surface"
          >
            <span className="font-medium">
              {p.repoName ?? <span className="text-ink-muted">Unnamed repo</span>}{" "}
              <span className="num text-sm text-ink-muted">#{p.id}</span>
            </span>
            <span className="flex flex-wrap gap-x-5 text-sm text-ink-muted">
              <span>
                Deposit <Amount value={p.depositAmount} className="text-ink" />
              </span>
              <span>
                Bounty pool <Amount value={p.available} className="text-ink" />
              </span>
              <span>{formatDuration(p.timeout)}</span>
              {creator && <span>{p.openReports} open</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
