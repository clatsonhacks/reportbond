"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { api, post } from "@/lib/api";
import { connectHref, useGithubSession, type TrackedReportView } from "@/lib/github";
import { formatDate } from "@/lib/format";
import type { PoolView } from "@/lib/types";
import { useSignIn } from "@/lib/useSignIn";
import { StatusPill } from "./StatusPill";
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
            <li key={r.ghsa} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="space-y-0.5">
                <a href={r.url} target="_blank" rel="noreferrer" className="num font-medium hover:underline">
                  {r.ghsa} ↗
                </a>
                <p className="text-ink-muted">
                  {r.reporter ? `@${r.reporter} · ` : ""}filed {formatDate(r.reportedAt)}
                  {r.bond === "awaiting" && ` · deposit due ${formatDate(r.bondDeadline)}`}
                </p>
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
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <Notice tone="slashed">{error}</Notice>}
    </Card>
  );
}
