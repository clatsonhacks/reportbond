"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { api, post } from "@/lib/api";
import { connectHref, useGithubSession, type TrackedReportView } from "@/lib/github";
import { formatDate } from "@/lib/format";
import type { PoolView } from "@/lib/types";
import { savedSignInToken, useSignIn } from "@/lib/useSignIn";
import type { TriageRun } from "@/lib/rules";
import { StatusPill } from "./StatusPill";
import { TriageResult } from "./TriageResult";
import { Button, buttonStyles, Card, Empty, Notice } from "./ui";
import { VerifiedBadge } from "./VerifiedBadge";

const tagTone = {
  good: "bg-returned-bg text-returned",
  warn: "bg-waiting-bg text-waiting",
  bad: "bg-slashed-bg text-slashed",
  neutral: "bg-surface text-ink-muted",
} as const;

const bondLabel: Record<TrackedReportView["bond"], { text: string; cls: string }> = {
  bonded: { text: "Deposit paid", cls: "bg-returned-bg text-returned" },
  awaiting: { text: "Awaiting deposit", cls: "bg-waiting-bg text-waiting" },
  unbonded: { text: "No deposit", cls: "bg-surface text-ink-muted" },
};

/** The pool's link to GitHub: verify it, then see private reports filed on GitHub and their deposit status. */
export function GithubReports({
  pool,
  isCreator,
  onReports,
}: {
  pool: PoolView;
  isCreator: boolean;
  /** Told about the reports whenever they load or a review finishes, so the review queue can show the AI's view. */
  onReports?: (reports: TrackedReportView[]) => void;
}) {
  const github = useGithubSession();
  const { address } = useAccount();
  const signIn = useSignIn();
  const qc = useQueryClient();
  const [reports, setReports] = useState<TrackedReportView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [attempted, setAttempted] = useState<Set<string>>(new Set());
  const [waits, setWaits] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const usable = Boolean(github.data?.configured && isCreator && pool.verifiedBy);

  // Already signed in with the wallet: show the reports without asking for a click.
  useEffect(() => {
    if (usable && reports === null && !busy && savedSignInToken(address)) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the pool and wallet are known
  }, [usable, address]);

  useEffect(() => {
    if (reports) onReports?.(reports);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the callback isn't a trigger
  }, [reports]);

  // Every report with a deposit gets a review. The server starts one when the deposit is paid; this
  // catches any it missed (a report paid for before the rules were published, or a run cut short).
  const pending = pool.rulesVersion !== null ? reports?.find((r) => r.bond === "bonded" && r.triage === null && !attempted.has(r.ghsa)) : undefined;
  useEffect(() => {
    if (!pending || reviewing !== null) return;
    // The server's own review may still be running: look again a few times before starting another.
    if (waits < 5) {
      const t = setTimeout(() => {
        setWaits((n) => n + 1);
        void load();
      }, 20_000);
      return () => clearTimeout(t);
    }
    setAttempted((s) => new Set(s).add(pending.ghsa));
    void review(pending.ghsa);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one review at a time, each report once
  }, [pending?.ghsa, reviewing, waits]);

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
            Private vulnerability reports filed on GitHub, whether each reporter has paid the deposit, and what the AI
            reviewers found.
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
                {r.title && <p className="font-medium break-words">{r.title}</p>}
                <a href={r.url} target="_blank" rel="noreferrer" className="num font-medium hover:underline">
                  {r.ghsa} ↗
                </a>
                {r.tags.length > 0 && (
                  <p className="flex flex-wrap gap-1.5 pt-0.5">
                    {r.tags.map((t) => (
                      <span key={t.label} className={`rounded-full px-2 py-0.5 text-xs font-medium ${tagTone[t.tone]}`}>
                        {t.label}
                      </span>
                    ))}
                  </p>
                )}
                <p className="text-ink-muted">
                  {r.reporter ? `@${r.reporter} · ` : ""}filed {formatDate(r.reportedAt)}
                  {r.bond === "awaiting" && ` · deposit due ${formatDate(r.bondDeadline)}`}
                </p>
                {r.reporterMatch === "mismatch" && (
                  <p className="text-xs text-waiting">
                    Deposit paid by a wallet linked to @{r.depositorLogin}, not the filer{r.reporter ? ` @${r.reporter}` : ""}
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
      {error && (
        <div className="space-y-2">
          <Notice tone="slashed">{error}</Notice>
          {session.connected && pool.repoName && (
            <Button variant="secondary" onClick={verify} disabled={busy}>
              {busy ? "Re-verifying…" : "Re-verify with GitHub"}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
