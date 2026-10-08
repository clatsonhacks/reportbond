"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { StatusPill } from "@/components/StatusPill";
import { Amount, ButtonLink, Card, Empty, Loading, Notice, Row } from "@/components/ui";
import { usePool } from "@/lib/api";
import { formatDate, formatDuration, plural, shortAddress } from "@/lib/format";
import { addressUrl } from "@/lib/network";

export default function PoolPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, error } = usePool(id);

  if (isLoading) return <Loading />;
  if (error || !data) return <Notice tone="slashed">{error?.message ?? "Pool not found"}</Notice>;
  const { pool, recent } = data;
  const creatorUrl = addressUrl(pool.creator);

  return (
    <div className="space-y-6">
      <Card>
        <p className="text-sm text-ink-muted">Security reports</p>
        <h1 className="mt-1 text-2xl font-semibold break-words">{pool.repoName ?? `Pool #${pool.id}`}</h1>

        {/* The three numbers answer: what do I risk, what can I win, how long do I wait. */}
        <dl className="mt-5 divide-y divide-line border-y border-line">
          <Row label="Deposit" value={<Amount value={pool.depositAmount} />} note="refunded if honest" />
          <Row label="Bounty pool" value={<Amount value={pool.available} />} note="available now" />
          <Row label="Response time" value={formatDuration(pool.timeout)} note="or your deposit returns" />
        </dl>
        <p className="mt-2 text-sm text-ink-muted">
          Bounties up to <Amount value={pool.maxPayout} /> per valid report, paid from the pool.
        </p>

        <div className="mt-6">
          <ButtonLink href={`/pool/${pool.id}/report`}>Report with deposit</ButtonLink>
        </div>
      </Card>

      <details className="rounded-[8px] border border-line bg-card p-5">
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

      <section className="space-y-3">
        <h2 className="font-semibold">Recent outcomes</h2>
        <p className="text-sm text-ink-muted">
          {pool.outcomes.valid} valid · {plural(pool.outcomes.mistake, "honest mistake")} · {pool.outcomes.slop} slop ·{" "}
          {pool.outcomes.refunded} refunded after the deadline · {pool.openReports} open
        </p>
        {recent.length ? (
          <ul className="divide-y divide-line rounded-[8px] border border-line bg-card">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/report/${r.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface">
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

      <p className="text-sm text-ink-muted">
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
  );
}
