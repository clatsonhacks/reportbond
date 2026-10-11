"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Hex } from "viem";
import { useAccount, useSignTypedData, useWriteContract } from "wagmi";
import { GithubReports } from "@/components/GithubReports";
import type { TriageRun } from "@/lib/rules";
import { RulesEditor } from "@/components/RulesEditor";
import { TxStatus } from "@/components/TxStatus";
import { Amount, Button, Card, Empty, Loading, Notice, Row } from "@/components/ui";
import { WalletGate } from "@/components/WalletGate";
import { api, post, usePool, useReports } from "@/lib/api";
import { reportBond } from "@/lib/contract";
import { acknowledgeTypedData, Verdict, verdictTypedData } from "@/lib/eip712";
import { formatDuration, formatUsdc, parseUsdc, shortAddress, usdcInput } from "@/lib/format";
import { chain } from "@/lib/network";
import type { PoolView, ReportView } from "@/lib/types";
import { useNow } from "@/lib/useNow";
import { useSignIn } from "@/lib/useSignIn";
import { useTx } from "@/lib/useTx";

export default function MaintainerPool() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const created = search.get("created");
  const verifyFailed = search.get("verify") === "failed";
  const { data, isLoading, error, refetch } = usePool(id);
  const queue = useReports({ pool: id, open: "1" });
  const { address } = useAccount();
  // The AI's latest review of each open report, by on-chain report ID.
  const [reviews, setReviews] = useState<Record<number, TriageRun>>({});

  if (isLoading) return <Loading />;
  if (error || !data) return <Notice tone="slashed">{error?.message ?? "Pool not found"}</Notice>;
  const { pool } = data;
  const isCreator = address?.toLowerCase() === pool.creator;
  const isSigner = address?.toLowerCase() === pool.verdictSigner;
  const poolUrl = typeof window !== "undefined" ? `${window.location.origin}/pool/${pool.id}` : `/pool/${pool.id}`;
  // Rules are compulsory: the pool takes no reports until its creator publishes them.
  const needsRules = Boolean(pool.verifiedBy) && pool.rulesVersion === null;

  const refresh = () => {
    refetch();
    queue.refetch();
  };

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="geometric-bg px-6 sm:px-12 py-8">
        <div className="mx-auto max-w-7xl">
          <Link href="/maintainer" className="text-sm text-ink-muted hover:text-ink">
            ← Maintainer console
          </Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight">{pool.repoName ?? `Pool #${pool.id}`}</h1>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-6 sm:px-12 py-8 space-y-6">
      {needsRules ? (
        <Notice tone="waiting">
          <strong>{created ? "Pool created. One step left: publish the bounty rules." : "Publish the bounty rules to open this pool."}</strong>{" "}
          Reporters read them before reporting and the AI reviewers judge every report against them, so the pool takes
          no reports until they are published.
        </Notice>
      ) : (
        created && (
          <Notice tone="returned">
            Pool created. Add this to your repo&apos;s <span className="num">SECURITY.md</span> so reporters find it:
            <pre className="num mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-card p-2 text-xs">
              {`Private reports require a refundable deposit: ${poolUrl}`}
            </pre>
          </Notice>
        )
      )}

      {verifyFailed && (
        <Notice tone="waiting">
          The pool was created, but linking it to GitHub didn&apos;t finish. Use &quot;Verify with GitHub&quot; below to try
          again.
        </Notice>
      )}

      <WalletGate>
        {needsRules && isCreator && <RulesEditor pool={pool} required />}
        {!isSigner && (
          <Notice tone="waiting">
            Verdicts for this pool must be signed by <span className="num">{shortAddress(pool.verdictSigner)}</span>.
            Connect that wallet to review reports.
          </Notice>
        )}

        <section className="space-y-3">
          <h2 className="font-semibold">
            Review queue <span className="text-ink-muted">({queue.data?.reports.length ?? 0})</span>
          </h2>
          {queue.isLoading ? (
            <Loading />
          ) : !queue.data?.reports.length ? (
            <Empty>No reports waiting. Nice.</Empty>
          ) : (
            <ul className="space-y-3">
              {queue.data.reports.map((r) => (
                <ReviewItem key={r.id} report={r} pool={pool} canSign={isSigner} onDone={refresh} review={reviews[r.id]} />
              ))}
            </ul>
          )}
        </section>

        <GithubReports
          pool={pool}
          isCreator={isCreator}
          onReports={(list) =>
            setReviews(Object.fromEntries(list.filter((x) => x.reportId !== null && x.triage).map((x) => [x.reportId!, x.triage!])))
          }
        />

        {isCreator && !needsRules && <RulesEditor pool={pool} />}

        <PoolMoney pool={pool} isCreator={isCreator} onDone={refresh} />
      </WalletGate>
      </div>
    </div>
  );
}

const aiVerdict = { valid: "looks valid", mistake: "looks like an honest mistake", slop: "looks like slop" } as const;

function ReviewItem({
  report: r,
  pool,
  canSign,
  onDone,
  review,
}: {
  report: ReportView;
  pool: PoolView;
  canSign: boolean;
  onDone: () => void;
  review?: TriageRun;
}) {
  const now = useNow();
  const { signTypedDataAsync } = useSignTypedData();
  const { writeContractAsync } = useWriteContract();
  const signIn = useSignIn();
  const tx = useTx();
  const available = BigInt(pool.available);
  const cap = BigInt(pool.maxPayout) < available ? BigInt(pool.maxPayout) : available;

  const [choice, setChoice] = useState<Verdict | null>(null);
  const [bounty, setBounty] = useState(usdcInput(cap));
  const [link, setLink] = useState<string | null>(null);
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [selfSubmit, setSelfSubmit] = useState<null | (() => Promise<Hex>)>(null);

  const deposit = BigInt(r.deposit);
  let bountyWei = 0n;
  let bountyErr: string | null = null;
  if (choice === Verdict.Valid) {
    try {
      bountyWei = parseUsdc(bounty || "0");
      if (bountyWei > cap) bountyErr = `The most you can pay is ${formatUsdc(cap)}.`;
    } catch {
      bountyErr = "Enter an amount like 2.50";
    }
  }

  const consequence =
    choice === Verdict.Valid
      ? `Mark #${r.id} as Valid: the reporter gets their ${formatUsdc(deposit)} deposit back plus a ${formatUsdc(bountyWei)} bounty from your pool.`
      : choice === Verdict.Mistake
        ? `Mark #${r.id} as an honest mistake: the reporter's ${formatUsdc(deposit)} deposit is returned.`
        : choice === Verdict.Slop
          ? `Mark #${r.id} as Slop: the reporter's ${formatUsdc(deposit)} goes to your bounty pool.`
          : "";

  async function openLink() {
    setLinkErr(null);
    try {
      const token = await signIn();
      const res = await api<{ url: string }>(`/api/reports/${r.id}/advisory`, { headers: { authorization: `Bearer ${token}` } });
      setLink(res.url);
      window.open(res.url, "_blank", "noopener");
    } catch (e) {
      setLinkErr((e as Error).message);
    }
  }

  async function confirm() {
    if (choice === null || bountyErr) return;
    setSelfSubmit(null);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const typed = verdictTypedData({
      chainId: chain.id,
      contract: reportBond.address,
      reportId: BigInt(r.id),
      verdict: choice,
      bounty: bountyWei,
      deadline,
    });
    const hash = await tx.run(async () => {
      const signature = await signTypedDataAsync(typed);
      const args = [BigInt(r.id), choice, bountyWei, deadline, signature] as const;
      try {
        const res = await post<{ hash: Hex }>("/api/relay/verdict", {
          reportId: r.id,
          verdict: choice,
          bounty: bountyWei.toString(),
          deadline: deadline.toString(),
          signature,
        });
        return res.hash;
      } catch (e) {
        // If our relayer is down, the same signed message can be sent by anyone, including you.
        setSelfSubmit(() => () => writeContractAsync({ ...reportBond, functionName: "submitVerdict", args }));
        throw e;
      }
    });
    if (hash) onDone();
  }

  async function acknowledge() {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const typed = acknowledgeTypedData({ chainId: chain.id, contract: reportBond.address, reportId: BigInt(r.id), deadline });
    const hash = await tx.run(async () => {
      const signature = await signTypedDataAsync(typed);
      const res = await post<{ hash: Hex }>("/api/relay/acknowledge", {
        reportId: r.id,
        deadline: deadline.toString(),
        signature,
      });
      return res.hash;
    });
    if (hash) onDone();
  }

  async function sendMyself() {
    if (!selfSubmit) return;
    const hash = await tx.run(selfSubmit);
    if (hash) onDone();
  }

  const left = r.deadline - now;
  return (
    <li className="rounded-[8px] border border-line bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 text-sm">
        <Link href={`/report/${r.id}`} className="num font-medium hover:underline">
          #{r.id}
        </Link>
        <span className="text-ink-muted">{formatDuration(now - r.createdAt)} old</span>
        <span className={left <= 0 ? "text-slashed" : left < 86400 ? "text-waiting" : "text-ink-muted"}>
          {left > 0 ? `${formatDuration(left)} left` : "Deadline passed: the reporter can refund"}
        </span>
        <Amount value={r.deposit} />
        {r.status === 2 && <span className="text-ink-muted">Acknowledged</span>}
        {r.hasAdvisoryLink ? (
          <button onClick={openLink} className="text-accent underline-offset-2 hover:underline">
            Open advisory ↗
          </button>
        ) : (
          <span className="text-ink-muted">Advisory link not stored; check GitHub</span>
        )}
      </div>
      {review?.recommendation && (
        <p className="mt-2 text-sm">
          <span className="text-ink-muted">AI review:</span>{" "}
          <span className={review.recommendation.verdict === "slop" ? "font-medium text-slashed" : "font-medium text-returned"}>
            {aiVerdict[review.recommendation.verdict]}
          </span>{" "}
          <span className="text-ink-muted">
            ({Math.round(review.recommendation.confidence * 100)}% sure). The reasoning is under GitHub reports below. You
            decide.
          </span>
        </p>
      )}
      {review?.error && <p className="mt-2 text-sm text-ink-muted">The AI review didn&apos;t finish: {review.error}</p>}
      {link && <p className="num mt-2 break-all text-xs text-ink-muted">{link}</p>}
      {linkErr && <p className="mt-2 text-sm text-slashed">{linkErr}</p>}

      {canSign && left > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label={`Verdict for report ${r.id}`}>
            <Button variant={choice === Verdict.Valid ? "primary" : "secondary"} onClick={() => setChoice(Verdict.Valid)} disabled={tx.busy}>
              Valid
            </Button>
            <Button variant={choice === Verdict.Mistake ? "primary" : "secondary"} onClick={() => setChoice(Verdict.Mistake)} disabled={tx.busy}>
              Mistake
            </Button>
            <Button variant="danger" onClick={() => setChoice(Verdict.Slop)} disabled={tx.busy} aria-pressed={choice === Verdict.Slop}>
              Slop
            </Button>
            {r.status === 1 && (
              <Button variant="secondary" onClick={acknowledge} disabled={tx.busy}>
                Acknowledge
              </Button>
            )}
          </div>

          {choice === Verdict.Valid && (
            <label className="block space-y-1">
              <span className="text-sm font-medium">Bounty (USDC)</span>
              <input
                className="num w-40 rounded-[8px] border border-line bg-surface px-3 py-2 text-sm"
                inputMode="decimal"
                value={bounty}
                onChange={(e) => setBounty(e.target.value)}
              />
              <span className="block text-xs text-ink-muted">Up to {formatUsdc(cap)} (cap {formatUsdc(BigInt(pool.maxPayout))}, available {formatUsdc(available)}).</span>
              {bountyErr && <span className="block text-sm text-slashed">{bountyErr}</span>}
            </label>
          )}

          {choice !== null && (
            <div className="space-y-3 rounded-[8px] border border-line bg-surface p-3">
              <p className="text-sm">{consequence} This can&apos;t be undone.</p>
              <div className="flex gap-2">
                <Button onClick={confirm} disabled={tx.busy || Boolean(bountyErr)} variant={choice === Verdict.Slop ? "danger" : "primary"}>
                  Sign verdict
                </Button>
                <Button variant="secondary" onClick={() => setChoice(null)} disabled={tx.busy}>
                  Cancel
                </Button>
              </div>
              <p className="text-xs text-ink-muted">Signing is free. Our relayer pays the gas to deliver it.</p>
            </div>
          )}
          <TxStatus state={tx.state} waitingText="Sign the verdict in your wallet…" />
          {selfSubmit && tx.state.stage === "failed" && (
            <Notice tone="waiting">
              Our relayer couldn&apos;t deliver it. You can send the same signed verdict yourself (you pay a little gas).{" "}
              <Button variant="secondary" onClick={sendMyself} className="mt-2">
                Send it myself
              </Button>
            </Notice>
          )}
        </div>
      )}
    </li>
  );
}

function PoolMoney({ pool, isCreator, onDone }: { pool: PoolView; isCreator: boolean; onDone: () => void }) {
  const { writeContractAsync } = useWriteContract();
  const tx = useTx();
  const [fund, setFund] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const funded = BigInt(pool.fundedBalance);

  async function doFund() {
    const hash = await tx.run(() =>
      writeContractAsync({ ...reportBond, functionName: "fundPool", args: [BigInt(pool.id)], value: parseUsdc(fund) }),
    );
    if (hash) {
      setFund("");
      onDone();
    }
  }
  async function doWithdraw() {
    const hash = await tx.run(() =>
      writeContractAsync({
        ...reportBond,
        functionName: "withdrawPoolFunds",
        args: [BigInt(pool.id), parseUsdc(withdrawAmt)],
      }),
    );
    if (hash) {
      setWithdrawAmt("");
      onDone();
    }
  }

  const field = "num w-36 rounded-[8px] border border-line bg-surface px-3 py-2 text-sm";
  return (
    <Card className="space-y-4">
      <h2 className="font-semibold">Pool money</h2>
      <dl className="divide-y divide-line border-y border-line">
        <Row label="Funded by you" value={<Amount value={pool.fundedBalance} />} note="withdrawable when no reports are open" />
        <Row label="From slop" value={<Amount value={pool.slashedBalance} />} note="pays bounties only, never withdrawable" />
        <Row label="Deposit" value={<Amount value={pool.depositAmount} />} note={`${formatDuration(pool.timeout)} to respond`} />
      </dl>
      {isCreator ? (
        <div className="flex flex-wrap gap-6">
          <div className="space-y-2">
            <p className="text-sm font-medium">Add bounty funds</p>
            <div className="flex gap-2">
              <input className={field} inputMode="decimal" placeholder="10.00" value={fund} onChange={(e) => setFund(e.target.value)} />
              <Button onClick={doFund} disabled={tx.busy || !fund}>
                Fund
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Withdraw your funds</p>
            <div className="flex gap-2">
              <input className={field} inputMode="decimal" placeholder={usdcInput(funded)} value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} />
              <Button variant="secondary" onClick={doWithdraw} disabled={tx.busy || !withdrawAmt || pool.openReports > 0}>
                Withdraw
              </Button>
            </div>
            {pool.openReports > 0 && <p className="text-xs text-ink-muted">Available once no reports are open.</p>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-ink-muted">Only the pool creator can add or withdraw funds.</p>
      )}
      <TxStatus state={tx.state} />
    </Card>
  );
}
