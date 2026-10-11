"use client";

// Three steps, one decision each: paste the link → review → pay (docs/DESIGN.md).
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { parseEventLogs, type Hex } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { FilingFee } from "@/components/FilingFee";
import { GithubIdentity } from "@/components/GithubIdentity";
import { MyGithubReports } from "@/components/MyGithubReports";
import type { MyReportView } from "@/lib/github";
import type { FeeView, PaymentRequired } from "@/lib/nano";
import { TxStatus } from "@/components/TxStatus";
import { Amount, Button, ButtonLink, Card, Loading, Notice } from "@/components/ui";
import { WalletGate } from "@/components/WalletGate";
import { post, usePool } from "@/lib/api";
import { reportBond } from "@/lib/contract";
import { formatUsdc } from "@/lib/format";
import { useTx } from "@/lib/useTx";

type Checked = { repo: string; ghsa: string; url: string; advisoryHash: Hex; fee?: FeeView };
type FeeDue = { url: string; paymentRequired: PaymentRequired };

export default function ReportFlow() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = usePool(id);
  const [link, setLink] = useState("");
  const [checking, setChecking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [checked, setChecked] = useState<Checked | null>(null);
  const [feeDue, setFeeDue] = useState<FeeDue | null>(null);
  const [reportId, setReportId] = useState<bigint | null>(null);
  const [linkSaveError, setLinkSaveError] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();
  const client = usePublicClient();
  const tx = useTx();

  if (isLoading) return <Loading />;
  if (error || !data) return <Notice tone="slashed">{error?.message ?? "Pool not found"}</Notice>;
  const { pool } = data;
  const deposit = BigInt(pool.depositAmount);
  const deadline = new Date(Date.now() + pool.timeout * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  const step = reportId ? 4 : checked ? 2 : 1;

  // Asks the server whether this report can be paid for. A 402 answer means a filing fee is due:
  // the fee step signs a payment and this runs again with it.
  async function runCheck(url: string, paymentHeader?: string) {
    setChecking(true);
    setLinkError(null);
    try {
      const res = await fetch("/api/advisory/check", {
        method: "POST",
        headers: { "content-type": "application/json", ...(paymentHeader ? { "Payment-Signature": paymentHeader } : {}) },
        body: JSON.stringify({ poolId: pool.id, url }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 402 && body.paymentRequired) {
        setFeeDue({ url, paymentRequired: body.paymentRequired });
        if (paymentHeader) setLinkError(body.error);
      } else if (!res.ok) {
        throw new Error(body.error ?? `Request failed (${res.status})`);
      } else {
        setFeeDue(null);
        setChecked(body as Checked);
      }
    } catch (err) {
      setLinkError((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  function check(e: React.FormEvent) {
    e.preventDefault();
    void runCheck(link);
  }

  // Verified pools: the reporter picks one of their own reports from GitHub instead of pasting a link.
  const pick = (r: MyReportView) => void runCheck(r.url);

  async function pay() {
    if (!checked) return;
    const hash = await tx.run(() =>
      writeContractAsync({
        ...reportBond,
        functionName: "submitReport",
        args: [BigInt(pool.id), checked.advisoryHash],
        value: deposit,
      }),
    );
    if (!hash || !client) return;
    const receipt = await client.getTransactionReceipt({ hash });
    const [event] = parseEventLogs({ abi: reportBond.abi, eventName: "ReportSubmitted", logs: receipt.logs });
    const newId = event.args.reportId;
    setReportId(newId);
    // Store the link privately so the maintainer can open it; only its hash is on-chain.
    try {
      await post(`/api/reports/${newId}/advisory`, { url: checked.url });
    } catch (err) {
      setLinkSaveError((err as Error).message);
    }
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="geometric-bg px-6 sm:px-12 py-8">
        <div className="mx-auto max-w-7xl">
          <Link href={`/pool/${pool.id}`} className="text-sm text-ink-muted hover:text-ink">
            ← {pool.repoName ?? `Pool #${pool.id}`}
          </Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Report with deposit</h1>
          <ol className="mt-3 flex gap-4 text-sm" aria-label="Steps">
            {[pool.verifiedBy ? "Your report" : "Advisory link", "Review", "Pay"].map((s, i) => (
              <li key={s} className={step > i + 1 ? "text-returned" : step === i + 1 ? "font-medium" : "text-ink-muted"} aria-current={step === i + 1 ? "step" : undefined}>
                <span className="num">{i + 1}.</span> {s}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 sm:px-12 py-8 space-y-6">

      {!pool.acceptingReports && step === 1 && (
        <Notice tone="waiting">
          This pool isn&apos;t taking reports yet: its maintainer hasn&apos;t published the bounty rules.
        </Notice>
      )}

      {step === 1 && feeDue && (
        <Card>
          <FilingFee
            due={feeDue.paymentRequired}
            error={linkError}
            busy={checking}
            onPay={(header) => void runCheck(feeDue.url, header)}
            onCancel={() => {
              setFeeDue(null);
              setLinkError(null);
            }}
          />
        </Card>
      )}

      {step === 1 && !feeDue && pool.acceptingReports && (
        <Card>
          {pool.verifiedBy ? (
            <div className="space-y-4">
              <MyGithubReports pool={pool} onPick={pick} busy={checking} />
              {linkError && <Notice tone="slashed">{linkError}</Notice>}
            </div>
          ) : (
          <form onSubmit={check} className="space-y-4">
            <label htmlFor="link" className="block font-medium">
              Paste your GitHub advisory link
            </label>
            <p className="text-sm text-ink-muted">
              File your private vulnerability report on GitHub first, then copy its address. It looks like{" "}
              <span className="num break-all">github.com/{pool.repoName ?? "owner/repo"}/security/advisories/GHSA-…</span>
            </p>
            <input
              id="link"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://github.com/…/security/advisories/GHSA-…"
              className="num w-full rounded-[8px] border border-line bg-surface px-3 py-2.5 text-sm"
              autoComplete="off"
              spellCheck={false}
              required
            />
            {linkError && <Notice tone="slashed">{linkError}</Notice>}
            <Button type="submit" disabled={checking || !link.trim()}>
              {checking ? "Checking…" : "Continue"}
            </Button>
          </form>
          )}
        </Card>
      )}

      {step === 2 && checked && (
        <Card className="space-y-5">
          <div>
            <p className="text-sm text-ink-muted">Advisory</p>
            <p className="num mt-1 text-sm">
              {checked.repo} · {checked.ghsa}
            </p>
            {checked.fee?.paid && <p className="mt-1 text-sm text-returned">Filing fee paid</p>}
          </div>
          <p className="text-lg leading-relaxed">
            You&apos;ll deposit <Amount value={deposit} />. You get it back if your report is valid or an honest mistake,
            or if the maintainer doesn&apos;t answer by {deadline}. You lose it only if the report is judged low-effort
            or fabricated.
          </p>
          {BigInt(pool.available) > 0n && (
            <p className="text-sm text-ink-muted">
              A valid report can also earn a bounty of up to <Amount value={pool.maxPayout} />.
            </p>
          )}
          <WalletGate need={deposit}>
            <GithubIdentity />
            <div className="flex flex-wrap gap-3">
              <Button onClick={pay} disabled={tx.busy}>
                Pay {formatUsdc(deposit)} deposit
              </Button>
              <Button variant="secondary" onClick={() => setChecked(null)} disabled={tx.busy}>
                Back
              </Button>
            </div>
          </WalletGate>
          <TxStatus state={tx.state} />
        </Card>
      )}

      {step === 4 && reportId && (
        <Card className="space-y-4">
          <h2 className="text-xl font-semibold">Report #{reportId.toString()} filed</h2>
          <p>
            Your <Amount value={deposit} /> deposit is held by the contract. The maintainer has until {deadline} to give a
            verdict.
          </p>
          <TxStatus state={tx.state} />
          {linkSaveError && (
            <Notice tone="waiting">
              Your report is on-chain, but we couldn&apos;t save the advisory link ({linkSaveError}). The maintainer can
              still find it on GitHub.
            </Notice>
          )}
          <ButtonLink href={`/report/${reportId}`}>Track your report</ButtonLink>
        </Card>
      )}
      </div>
    </div>
  );
}
