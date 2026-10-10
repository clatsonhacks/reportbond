"use client";

import Link from "next/link";
import { useAccount } from "wagmi";
import { GithubIdentity } from "@/components/GithubIdentity";
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
    <div className="fade-in">
      {/* Header */}
      <div className="geometric-bg px-6 sm:px-12 py-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-black tracking-tight">My reports</h1>
          <p className="mt-1 text-ink-muted">Track your submitted reports and withdrawable funds.</p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 sm:px-12 py-8 space-y-6">
        <WalletGate>
          <div className="slide-up">
            <WithdrawCard />
            <div className="mt-4">
              <GithubIdentity />
            </div>
          </div>
          {isLoading ? (
            <Loading />
          ) : !data?.reports.length ? (
            <Empty>You haven&apos;t filed any reports from this wallet.</Empty>
          ) : (
            <div className="slide-up space-y-4">
              <h2 className="text-xl font-bold">Reports</h2>
              <ul className="divide-y divide-line rounded-xl border border-line bg-card">
                {data.reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/report/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface state-change">
                      <div>
                        <span className="font-medium">Report <span className="num">#{r.id}</span></span>
                        <span className="text-ink-muted"> · {r.repoName ?? `Pool #${r.poolId}`}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-sm text-ink-muted">{formatDate(r.createdAt)}</span>
                        <Amount value={r.deposit} className="text-sm font-medium" />
                        <StatusPill status={r.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </WalletGate>
      </div>
    </div>
  );
}
