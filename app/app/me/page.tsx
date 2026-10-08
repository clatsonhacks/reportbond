"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { StatusPill } from "@/components/StatusPill";
import { Amount, Empty, Loading } from "@/components/ui";
import { WalletGate } from "@/components/WalletGate";
import { WithdrawCard } from "@/components/WithdrawCard";
import { useReports } from "@/lib/api";
import { formatDate } from "@/lib/format";

export default function MyReports() {
  const { address } = useAccount();
  const { data, isLoading } = useReports({ reporter: address?.toLowerCase() }, Boolean(address));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My reports</h1>
      <WalletGate>
        <WithdrawCard />
        {isLoading ? (
          <Loading />
        ) : !data?.reports.length ? (
          <Empty>You haven&apos;t filed any reports from this wallet.</Empty>
        ) : (
          <ul className="divide-y divide-line rounded-[8px] border border-line bg-card">
            {data.reports.map((r) => (
              <li key={r.id}>
                <Link href={`/report/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-surface">
                  <span>
                    <span className="num">#{r.id}</span> · {r.repoName ?? `Pool #${r.poolId}`}
                  </span>
                  <span className="text-sm text-ink-muted">{formatDate(r.createdAt)}</span>
                  <Amount value={r.deposit} className="text-sm" />
                  <StatusPill status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </WalletGate>
    </div>
  );
}
