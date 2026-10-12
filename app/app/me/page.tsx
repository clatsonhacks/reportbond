"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { GithubIdentity } from "@/components/GithubIdentity";
import { MyReportNetwork } from "@/components/graph/MyReportNetwork";
import { StatusPill } from "@/components/StatusPill";
import { TrackRecordBar } from "@/components/TrackRecordBar";
import { Amount, ButtonLink, Card, Empty, Loading } from "@/components/ui";
import { WalletGate } from "@/components/WalletGate";
import { WithdrawalHistory } from "@/components/WithdrawalHistory";
import { WithdrawCard } from "@/components/WithdrawCard";
import { useReports } from "@/lib/api";
import { Status } from "@/lib/eip712";
import { formatDate, formatUsdc, plural, shortAddress } from "@/lib/format";
import type { Outcomes, ReportView } from "@/lib/types";

function sumWhere(reports: ReportView[], field: "deposit" | "bounty", pred: (r: ReportView) => boolean): bigint {
  return reports.filter(pred).reduce((acc, r) => acc + BigInt(r[field]), 0n);
}

export default function MyReports() {
  const { address } = useAccount();
  const qc = useQueryClient();
  const { data, isLoading } = useReports({ reporter: address?.toLowerCase() }, Boolean(address));
  const reports = data?.reports ?? [];

  const poolCount = new Set(reports.map((r) => r.poolId)).size;
  const bountiesEarned = sumWhere(reports, "bounty", (r) => r.status === Status.Valid);
  const bondsAtStake = sumWhere(reports, "deposit", (r) => r.status === Status.Submitted || r.status === Status.Acknowledged);
  const bondsLost = sumWhere(reports, "deposit", (r) => r.status === Status.Slop);
  const outcomes: Outcomes = {
    valid: reports.filter((r) => r.status === Status.Valid).length,
    mistake: reports.filter((r) => r.status === Status.Mistake).length,
    slop: reports.filter((r) => r.status === Status.Slop).length,
    refunded: reports.filter((r) => r.status === Status.Refunded).length,
  };

  const refetchWithdrawals = () => qc.invalidateQueries({ queryKey: ["withdrawals", address?.toLowerCase() ?? null] });

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="geometric-bg px-6 sm:px-12 py-8">
        <div className="mx-auto max-w-[1600px] flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight">My reports</h1>
            <p className="mt-1 text-ink-muted">
              {address ? (
                <>
                  <span className="num">{shortAddress(address)}</span> · {plural(reports.length, "report")} across{" "}
                  {plural(poolCount, "pool")}
                </>
              ) : (
                "Track your submitted reports and withdrawable funds."
              )}
            </p>
          </div>
          <ButtonLink href="/" variant="secondary">
            Find another pool
          </ButtonLink>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-6 sm:px-12 py-8 space-y-6">
        <WalletGate>
          <div className="slide-up">
            <WithdrawCard onWithdrawn={refetchWithdrawals} />
            <div className="mt-4">
              <GithubIdentity />
            </div>
          </div>

          {isLoading ? (
            <Loading />
          ) : (
            <>
              <div className="slide-up grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Card className="space-y-1 p-4">
                  <p className="text-xs uppercase tracking-wider text-ink-muted">Bounties earned</p>
                  <p className="num text-xl font-bold text-valid">+{formatUsdc(bountiesEarned)}</p>
                  <p className="text-xs text-ink-muted">{plural(outcomes.valid, "valid report")}</p>
                </Card>
                <Card className="space-y-1 p-4">
                  <p className="text-xs uppercase tracking-wider text-ink-muted">Bonds at stake</p>
                  <p className="num text-xl font-bold">{formatUsdc(bondsAtStake)}</p>
                  <p className="text-xs text-ink-muted">
                    {plural(reports.filter((r) => r.status === Status.Submitted || r.status === Status.Acknowledged).length, "open report")}
                  </p>
                </Card>
                <Card className="space-y-1 p-4">
                  <p className="text-xs uppercase tracking-wider text-ink-muted">Bonds lost</p>
                  <p className="num text-xl font-bold text-slop">{bondsLost > 0n ? `−${formatUsdc(bondsLost)}` : formatUsdc(0n)}</p>
                  <p className="text-xs text-ink-muted">{plural(outcomes.slop, "marked slop")}</p>
                </Card>
                <Card className="space-y-1 p-4">
                  <p className="text-xs uppercase tracking-wider text-ink-muted">Track record</p>
                  <TrackRecordBar record={outcomes} />
                </Card>
              </div>

              {reports.length > 0 && (
                <section className="slide-up space-y-3">
                  <h2 className="text-xl font-bold">Your report network</h2>
                  <MyReportNetwork reports={reports} />
                </section>
              )}

              <div className="slide-up flex flex-wrap items-start gap-6">
                <div className="flex-[999_1_560px] space-y-4">
                  <h2 className="text-xl font-bold">Reports</h2>
                  {!reports.length ? (
                    <Empty>You haven&apos;t filed any reports from this wallet.</Empty>
                  ) : (
                    <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                      {reports.map((r) => (
                        <li key={r.id}>
                          <Link href={`/report/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface state-change">
                            <div>
                              <span className="font-medium">
                                Report <span className="num">#{r.id}</span>
                              </span>
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
                  )}
                </div>
                <div className="flex-1 min-w-[300px] space-y-4">
                  <h2 className="text-xl font-bold">Withdrawals</h2>
                  <WithdrawalHistory account={address} />
                </div>
              </div>
            </>
          )}
        </WalletGate>
      </div>
    </div>
  );
}
