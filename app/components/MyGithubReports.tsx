"use client";

// For reporters on a verified pool: instead of pasting a link, sign in with GitHub and pick your report.
// Only reports that exist on GitHub, filed by the signed-in account, can be paid for.
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useGithubSession, type MyReportView } from "@/lib/github";
import type { PoolView } from "@/lib/types";
import { GithubSignInButton } from "./GithubConnect";
import { StatusPill } from "./StatusPill";
import { Amount, Button, buttonStyles, Empty, Loading, Notice } from "./ui";

type Mine = { login: string; reports: MyReportView[]; available: boolean };

export function MyGithubReports({ pool, onPick, busy }: { pool: PoolView; onPick: (r: MyReportView) => void; busy: boolean }) {
  const pathname = usePathname();
  const github = useGithubSession();
  const signedIn = Boolean(github.data?.connected);
  const mine = useQuery({
    queryKey: ["my-github-reports", pool.id, github.data?.login ?? null],
    queryFn: () => api<Mine>(`/api/github/my-reports?pool=${pool.id}`),
    enabled: signedIn,
  });
  const newReportUrl = pool.repoName ? `https://github.com/${pool.repoName}/security/advisories/new` : null;

  if (!signedIn) {
    return (
      <div className="space-y-3">
        <p className="font-medium">Sign in with GitHub to see your reports</p>
        <p className="text-sm text-ink-muted">
          We look up the private reports your account filed on {pool.repoName ?? "this repository"}, and you pick the one
          to pay the deposit for. There&apos;s nothing to copy or paste.
        </p>
        <GithubSignInButton next={pathname} />
      </div>
    );
  }
  if (mine.isLoading) return <Loading />;
  if (mine.error) return <Notice tone="slashed">{mine.error.message}</Notice>;
  const data = mine.data!;

  const fileOne = newReportUrl && (
    <a className={buttonStyles.secondary} href={newReportUrl} target="_blank" rel="noreferrer">
      File a report on GitHub ↗
    </a>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          Your reports on {pool.repoName ?? "this repository"} <span className="font-normal text-ink-muted">as @{data.login}</span>
        </p>
        <Button variant="secondary" onClick={() => mine.refetch()} disabled={mine.isFetching}>
          {mine.isFetching ? "Checking GitHub…" : "Refresh"}
        </Button>
      </div>

      {!data.available ? (
        <Notice tone="waiting">
          This repository doesn&apos;t accept private vulnerability reports on GitHub. It has to be public, with private
          vulnerability reporting turned on in its security settings.
        </Notice>
      ) : data.reports.length === 0 ? (
        <div className="space-y-3">
          <Empty>No private reports from @{data.login} on this repository yet.</Empty>
          <p className="text-sm text-ink-muted">
            File your report on GitHub first (Security → Report a vulnerability), then come back and press Refresh.
          </p>
          {fileOne}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {data.reports.map((r) => (
              <li key={r.ghsa} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 space-y-0.5">
                  <p className="font-medium break-words">{r.title ?? r.ghsa}</p>
                  <p className="text-ink-muted">
                    <span className="num">{r.ghsa}</span> · filed {formatDate(r.reportedAt)}
                  </p>
                </div>
                {r.reportId !== null && r.status !== null ? (
                  <Link href={`/report/${r.reportId}`} className="flex items-center gap-2">
                    <StatusPill status={r.status} />
                    <span className="text-ink-muted underline underline-offset-2">Track</span>
                  </Link>
                ) : r.githubState === "closed" ? (
                  <span className="text-ink-muted">Closed on GitHub</span>
                ) : (
                  <Button onClick={() => onPick(r)} disabled={busy}>
                    Pay <Amount value={r.depositAmount} /> deposit
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {fileOne}
        </>
      )}
    </div>
  );
}
