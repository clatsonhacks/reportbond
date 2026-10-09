"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { StatusPill } from "@/components/StatusPill";
import { TxStatus } from "@/components/TxStatus";
import { Amount, Button, Card, ExplorerLink, Loading, Notice } from "@/components/ui";
import { WalletGate } from "@/components/WalletGate";
import { WithdrawCard } from "@/components/WithdrawCard";
import { api, useReport } from "@/lib/api";
import { reportBond } from "@/lib/contract";
import { Status } from "@/lib/eip712";
import { formatDate, formatDuration } from "@/lib/format";
import type { ReportView } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import { useSignIn } from "@/lib/useSignIn";
import { useTx } from "@/lib/useTx";

const verdictLine: Record<number, (r: ReportView) => React.ReactNode> = {
  [Status.Valid]: (r) => (
    <>
      Valid. <Amount value={BigInt(r.deposit) + BigInt(r.bounty)} /> credited to the reporter (deposit plus{" "}
      <Amount value={r.bounty} /> bounty).
    </>
  ),
  [Status.Mistake]: (r) => (
    <>
      Honest mistake. The <Amount value={r.deposit} /> deposit was credited back to the reporter.
    </>
  ),
  [Status.Slop]: (r) => (
    <>
      Slop. The <Amount value={r.deposit} /> deposit went to the bounty pool, to pay future valid reports.
    </>
  ),
};

export default function ReportStatus() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error, refetch } = useReport(id);
  const now = useNow();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const refund = useTx();

  if (isLoading) return <Loading />;
  if (error || !data) return <Notice tone="slashed">{error?.message ?? "Report not found"}</Notice>;
  const { report: r, pool } = data;

  const open = r.status === Status.Submitted || r.status === Status.Acknowledged;
  const left = r.deadline - now;
  const due = open && left <= 0;
  const submitted = r.timeline.find((e) => e.kind === "ReportSubmitted");
  const acked = r.timeline.find((e) => e.kind === "ReportAcknowledged");
  const final = r.timeline.find((e) => e.kind === "VerdictGiven" || e.kind === "ReportRefunded");
  const isParty = address && (address.toLowerCase() === r.reporter || address.toLowerCase() === pool?.creator);

  async function triggerRefund() {
    const hash = await refund.run(() =>
      writeContractAsync({ ...reportBond, functionName: "refundExpired", args: [BigInt(r.id)] }),
    );
    if (hash) refetch();
  }

  return (
    <div className="space-y-6">
      <Card className="fade-in">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="min-w-0 text-xl font-semibold break-words">
            Report <span className="num">#{r.id}</span>
            <span className="text-ink-muted"> · </span>
            <Link href={`/pool/${r.poolId}`} className="hover:underline">
              {r.repoName ?? `Pool #${r.poolId}`}
            </Link>
          </h1>
          <StatusPill status={r.status} />
        </div>

        <ol className="mt-6 space-y-0 border-y border-line">
          <TimelineStep
            done
            title="Submitted"
            time={submitted?.time}
            detail={
              <>
                <Amount value={r.deposit} /> deposited
              </>
            }
            tx={submitted?.tx}
          />
          {(acked || open) && (
            <TimelineStep done={Boolean(acked)} title="Acknowledged" time={acked?.time} tx={acked?.tx} optional={!acked} />
          )}
          <TimelineStep
            done={Boolean(final)}
            title={r.status === Status.Refunded ? "Refunded" : "Verdict"}
            time={final?.time}
            tx={final?.tx}
            detail={
              final ? undefined : left > 0 ? (
                <>
                  due by {formatDate(r.deadline)} ({formatDuration(left)} left)
                </>
              ) : (
                <span className="text-waiting">deadline passed {formatDate(r.deadline)}</span>
              )
            }
          />
        </ol>

        <div className="mt-5 space-y-3">
          {verdictLine[r.status] && <Notice tone={r.status === Status.Slop ? "slashed" : "returned"}>{verdictLine[r.status](r)}</Notice>}
          {r.status === Status.Refunded && (
            <Notice tone="returned">
              No verdict before the deadline, so the <Amount value={r.deposit} /> deposit was credited back to the reporter.
            </Notice>
          )}
          {open && (
            <>
              <p className="text-sm text-ink-muted">
                If there&apos;s no verdict by the deadline, anyone can return the deposit, even if our server is down.
              </p>
              {due ? (
                <WalletGate>
                  <Button onClick={triggerRefund} disabled={refund.busy}>
                    Trigger refund
                  </Button>
                </WalletGate>
              ) : (
                <Button disabled title="Available once the deadline passes">
                  Trigger refund
                </Button>
              )}
              <TxStatus state={refund.state} />
            </>
          )}
        </div>
      </Card>

      {address?.toLowerCase() === r.reporter && (
        <div className="slide-up">
          <WithdrawCard />
        </div>
      )}
      {isParty && r.hasAdvisoryLink && (
        <div className="slide-up">
          <AdvisoryLink reportId={r.id} />
        </div>
      )}
    </div>
  );
}

function TimelineStep({
  done,
  title,
  time,
  detail,
  tx,
  optional,
}: {
  done: boolean;
  title: string;
  time?: number;
  detail?: React.ReactNode;
  tx?: string;
  optional?: boolean;
}) {
  return (
    <li className="state-change grid grid-cols-[1.25rem_1fr_auto] items-baseline gap-x-3 border-b border-line py-3 last:border-0 sm:grid-cols-[1.25rem_9rem_8rem_1fr_auto]">
      <span aria-hidden className={done ? "text-accent" : "text-ink-muted"}>
        <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="8" r="6" fill={done ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" />
          {done && <circle cx="8" cy="8" r="3" fill="white" />}
        </svg>
      </span>
      <span className={done ? "font-medium" : "text-ink-muted"}>
        {title}
        {optional && <span className="text-xs text-ink-muted"> (optional)</span>}
        <span className="sr-only">{done ? ", done" : ", not yet"}</span>
      </span>
      <span className="col-start-2 text-sm text-ink-muted sm:col-start-auto">{time ? formatDate(time) : ""}</span>
      <span className="col-start-2 text-sm sm:col-start-auto">{detail}</span>
      <span className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto">{tx && <ExplorerLink hash={tx} />}</span>
    </li>
  );
}

function AdvisoryLink({ reportId }: { reportId: number }) {
  const signIn = useSignIn();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function reveal() {
    setErr(null);
    try {
      const token = await signIn();
      const res = await api<{ url: string }>(`/api/reports/${reportId}/advisory`, {
        headers: { authorization: `Bearer ${token}` },
      });
      setUrl(res.url);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Card className="space-y-2">
      <p className="text-sm text-ink-muted">GitHub advisory (only you and the other party can see this)</p>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="num break-all text-sm text-accent underline">
          {url}
        </a>
      ) : (
        <Button variant="secondary" onClick={reveal}>
          Sign in to show link
        </Button>
      )}
      {err && <Notice tone="slashed">{err}</Notice>}
    </Card>
  );
}
