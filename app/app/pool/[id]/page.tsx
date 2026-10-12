"use client";

import { Breadcrumbs } from "@/components/Breadcrumbs";
import { ProposedFeeLine } from "@/components/FeeBreakdown";
import { ReportConstellation } from "@/components/graph/ReportConstellation";
import { OutcomeTable } from "@/components/OutcomeTable";
import { RulesSummary } from "@/components/RulesSummary";
import { VerifiedBadge } from "@/components/VerifiedBadge";
import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusPill } from "@/components/StatusPill";
import { Amount, ButtonLink, Card, Empty, Loading, Notice, Row } from "@/components/ui";
import { usePool, useReports } from "@/lib/api";
import { formatDate, formatDuration, plural, shortAddress } from "@/lib/format";
import { addressUrl } from "@/lib/network";

export default function PoolPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = usePool(id);
  // Unfiltered by status (unlike `recent`, which only returns decided reports) — the constellation's
  // whole point is showing how long still-open reports have waited.
  const allReports = useReports({ pool: id });

  if (isLoading) return <Loading />;
  if (error || !data) return <Notice tone="slashed">{error?.message ?? "Pool not found"}</Notice>;
  const { pool, recent } = data;
  const creatorUrl = addressUrl(pool.creator);

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="geometric-bg px-6 sm:px-12 py-8">
        <div className="relative z-10 mx-auto max-w-[1600px]">
          <Breadcrumbs items={[{ label: "Pools", href: "/" }, { label: pool.repoName ?? `Pool #${pool.id}` }]} />
          <h1 className="mt-2 text-3xl font-black tracking-tight">{pool.repoName ?? `Pool #${pool.id}`}</h1>
          <div className="mt-2">
            {pool.verifiedBy ? (
              <VerifiedBadge login={pool.verifiedBy} />
            ) : (
              <span className="text-xs text-ink-muted">Not verified on GitHub: check the repo&apos;s SECURITY.md links here.</span>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-6 sm:px-12 py-8 space-y-6">
      <Card>
        {/* The three numbers answer: what do I risk, what can I win, how long do I wait. */}
        <dl className="divide-y divide-line border-y border-line">
          <Row label="Deposit" value={<Amount value={pool.depositAmount} />} note="refunded if honest" />
          <Row label="Bounty pool" value={<Amount value={pool.available} />} note="available now" />
          <Row label="Response time" value={formatDuration(pool.timeout)} note="or your deposit returns" />
        </dl>
        <div className="mt-2">
          <ProposedFeeLine depositAmount={BigInt(pool.depositAmount)} />
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          Bounties up to <Amount value={pool.maxPayout} /> per valid report, paid from the pool.
        </p>
        {pool.autoSlop?.active && (
          <p className="mt-2 text-sm text-ink-muted">
            Every report is reviewed by AI first. One that both AI reviewers rate at least{" "}
            <span className="num">{pool.autoSlop.threshold}%</span> likely to be slop is rejected automatically and loses
            its deposit; everything else is decided by the maintainer.
          </p>
        )}

        <div className="mt-6">
          {pool.acceptingReports ? (
            <ButtonLink href={`/pool/${pool.id}/report`}>Report with deposit</ButtonLink>
          ) : (
            <Notice tone="waiting">
              This pool isn&apos;t taking reports yet: its maintainer hasn&apos;t published the bounty rules.
            </Notice>
          )}
        </div>
      </Card>

      <section className="space-y-3 slide-up">
        <h2 className="font-semibold">Report constellation</h2>
        <p className="text-sm text-ink-muted">
          Each report is a node around the pool. The further out, the longer it has waited. Anything past the
          dashed ring without a verdict is refundable.
        </p>
        {allReports.isLoading ? <Loading /> : <ReportConstellation pool={pool} reports={allReports.data?.reports ?? []} />}
      </section>

      <RulesSummary pool={pool} />

      <details className="slide-up rounded-2xl border border-line bg-card p-5 state-change">
        <summary className="cursor-pointer font-medium">How it works</summary>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink-muted">
          <li>File your private vulnerability report on GitHub first.</li>
          <li>Paste the advisory link here and pay exactly <Amount value={pool.depositAmount} />.</li>
          <li>
            The maintainer marks it Valid (deposit back plus a bounty), Honest mistake (deposit back) or Slop (deposit
            kept to pay future bounties).
          </li>
          <li>
            If there&apos;s no verdict within {formatDuration(pool.timeout)}, anyone can return your deposit, even if our
            server is down.
          </li>
        </ol>
        <p className="mt-3 text-sm text-ink-muted">
          Only a hash of your advisory link goes on-chain, so nobody can see which repo has an open report.
        </p>
      </details>

      <section className="space-y-3 slide-up">
        <h2 className="font-semibold">Recent outcomes</h2>
        <p className="text-sm text-ink-muted">
          {pool.outcomes.valid} valid · {plural(pool.outcomes.mistake, "honest mistake")} · {pool.outcomes.slop} slop ·{" "}
          {pool.outcomes.refunded} refunded after the deadline · {pool.openReports} open
        </p>
        {recent.length ? (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/report/${r.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface state-change">
                  <span className="num text-sm">#{r.id}</span>
                  <span className="text-sm text-ink-muted">{formatDate(r.timeline.at(-1)?.time ?? r.createdAt)}</span>
                  <StatusPill status={r.status} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No decided reports yet.</Empty>
        )}
      </section>

      <section className="space-y-3 slide-up">
        <h2 className="font-semibold">
          What your <Amount value={pool.depositAmount} /> can become
        </h2>
        <OutcomeTable deposit={BigInt(pool.depositAmount)} maxPayout={BigInt(pool.maxPayout)} timeoutLabel={formatDuration(pool.timeout)} />
      </section>

      <p className="slide-up text-sm text-ink-muted">
        Pool created {formatDate(pool.createdAt)} by{" "}
        {creatorUrl ? (
          <a href={creatorUrl} target="_blank" rel="noreferrer" className="num underline underline-offset-2">
            {shortAddress(pool.creator)}
          </a>
        ) : (
          <span className="num">{shortAddress(pool.creator)}</span>
        )}
        .
      </p>
      </div>
    </div>
  );
}
