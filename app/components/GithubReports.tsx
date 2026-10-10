"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api, post } from "@/lib/api";
import { connectHref, useGithubSession, type TrackedReportView } from "@/lib/github";
import { formatDate } from "@/lib/format";
import type { PoolView } from "@/lib/types";
import { useSignIn } from "@/lib/useSignIn";
import type { TriageRun } from "@/lib/rules";
import { StatusPill } from "./StatusPill";
import { TriageResult } from "./TriageResult";
import { Button, buttonStyles, Card, Empty, Notice } from "./ui";
import { VerifiedBadge } from "./VerifiedBadge";

const bondLabel: Record<TrackedReportView["bond"], { text: string; cls: string }> = {
  bonded: { text: "Deposit paid", cls: "bg-returned-bg text-returned" },
  awaiting: { text: "Awaiting deposit", cls: "bg-waiting-bg text-waiting" },
  unbonded: { text: "No deposit", cls: "bg-surface text-ink-muted" },
};

/** The pool's link to GitHub: verify it, then see private reports filed on GitHub and their deposit status. */
export function GithubReports({ pool, isCreator }: { pool: PoolView; isCreator: boolean }) {
  const github = useGithubSession();
  const signIn = useSignIn();
  const qc = useQueryClient();
  const [reports, setReports] = useState<TrackedReportView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!github.data?.configured || !isCreator) {
    return pool.verifiedBy ? <VerifiedBadge login={pool.verifiedBy} /> : null;
  }

  async function verify() {
    setBusy(true);
    setError(null);
    try {
      const token = await signIn();
      await post(`/api/pools/${pool.id}/verify`, { repo: pool.repoName }, { authorization: `Bearer ${token}` });
      qc.invalidateQueries({ queryKey: ["pool", String(pool.id)] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const token = await signIn();
      const res = await api<{ reports: TrackedReportView[] }>(`/api/github/reports?pool=${pool.id}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      setReports(res.reports);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function review(ghsa: string) {
    setReviewing(ghsa);
    setError(null);
    try {
      const token = await signIn();
      const res = await post<{ run: TriageRun }>(`/api/github/reports/${ghsa}/triage?pool=${pool.id}`, {}, {
        authorization: `Bearer ${token}`,
      });
      setReports((list) => list?.map((r) => (r.ghsa === ghsa ? { ...r, triage: res.run } : r)) ?? list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReviewing(null);
    }
  }

  const session = github.data;
  const canVerify = session.connected && pool.repoName && session.repos.includes(pool.repoName);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">GitHub reports</h2>
        <VerifiedBadge login={pool.verifiedBy} />
      </div>

      {!pool.verifiedBy ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            Link this pool to {pool.repoName ?? "its repository"} on GitHub. Reporters see a verified badge, and private
            reports filed on GitHub are tracked here automatically.
          </p>
          {canVerify ? (
            <Button onClick={verify} disabled={busy}>
              {busy ? "Verifying…" : "Verify with GitHub"}
            </Button>
          ) : session.connected ? (
            <Notice tone="waiting">
              @{session.login} isn&apos;t an admin of {pool.repoName ?? "this repository"}, or the ReportBond app isn&apos;t
              installed there.{" "}
              <a className="underline" href={connectHref("install")}>
                Install the app on it
              </a>
            </Notice>
          ) : (
            <a className={buttonStyles.primary} href={connectHref("install")}>
              Connect GitHub
            </a>
          )}
        </div>
      ) : reports === null ? (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            Private vulnerability reports filed on GitHub, and whether each reporter has paid the deposit.
          </p>
          <Button variant="secondary" onClick={load} disabled={busy}>
            {busy ? "Loading…" : "Show GitHub reports"}
          </Button>
        </div>
      ) : reports.length === 0 ? (
        <Empty>No private reports filed on GitHub yet.</Empty>
      ) : (
        <ul className="divide-y divide-line rounded-[8px] border border-line">
          {reports.map((r) => (
            <li key={r.ghsa} className="space-y-3 px-4 py-3 text-sm">
             <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5">
                <a href={r.url} target="_blank" rel="noreferrer" className="num font-medium hover:underline">
                  {r.ghsa} ↗
                </a>
                <p className="text-ink-muted">
                  {r.reporter ? `@${r.reporter} · ` : ""}filed {formatDate(r.reportedAt)}
                  {r.bond === "awaiting" && ` · deposit due ${formatDate(r.bondDeadline)}`}
                </p>
                {r.reporterMatch === "match" && (
                  <p className="text-xs text-returned">✓ Deposit paid by @{r.depositorLogin}, the account that filed this report</p>
                )}
                {r.reporterMatch === "mismatch" && (
                  <p className="text-xs text-waiting">
                    ⚠ Deposit paid by a wallet linked to @{r.depositorLogin}, not the filer{r.reporter ? ` @${r.reporter}` : ""}
                  </p>
                )}
                {r.reporterMatch === "unknown" && r.depositor && (
                  <p className="text-xs text-ink-muted">Deposit paid by a wallet with no linked GitHub account</p>
                )}
                {r.syncError && <p className="text-xs text-slashed">Couldn&apos;t update GitHub: {r.syncError}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${bondLabel[r.bond].cls}`}>
                  {bondLabel[r.bond].text}
                </span>
                {r.reportId !== null && r.status !== null && (
                  <Link href={`/report/${r.reportId}`} className="flex items-center gap-1">
                    <StatusPill status={r.status} />
                  </Link>
                )}
                <Button variant="secondary" onClick={() => review(r.ghsa)} disabled={reviewing !== null}>
                  {reviewing === r.ghsa ? "Reviewing…" : r.triage ? "Review again" : "Review with AI"}
                </Button>
              </div>
             </div>
              {reviewing === r.ghsa && (
                <p className="text-ink-muted">Checking the report against the repository. This takes up to a minute.</p>
              )}
              {r.triage && reviewing !== r.ghsa && <TriageResult run={r.triage} />}
            </li>
          ))}
        </ul>
      )}
      {error && <Notice tone="slashed">{error}</Notice>}
    </Card>
  );
}
