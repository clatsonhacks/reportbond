"use client";

// The pool's published rules, for reporters: scope, what a report needs, and what each severity pays.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatUsdc } from "@/lib/format";
import type { PoolRulesView } from "@/lib/rules";
import type { PoolView } from "@/lib/types";
import { Card } from "./ui";

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-ink-muted">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

export function RulesSummary({ pool }: { pool: PoolView }) {
  const { data } = useQuery({
    queryKey: ["pool-rules", String(pool.id)],
    queryFn: () => api<PoolRulesView>(`/api/pools/${pool.id}/rules`),
  });
  const published = data?.published;
  if (!published) return null;
  const { rules } = published;
  const cap = BigInt(pool.maxPayout);

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="font-semibold">Bounty rules</h2>
        <p className="mt-1 text-sm text-ink-muted">{rules.summary}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-ink-muted">
            <tr>
              <th className="py-2 pr-4 font-medium">Severity</th>
              <th className="py-2 pr-4 font-medium">What it looks like here</th>
              <th className="py-2 text-right font-medium">Bounty</th>
            </tr>
          </thead>
          <tbody>
            {[...rules.severity].reverse().map((s) => (
              <tr key={s.level} className="border-b border-line last:border-0">
                <td className="py-2 pr-4 font-medium capitalize">{s.level}</td>
                <td className="py-2 pr-4 text-ink-muted">{s.description}</td>
                <td className="num py-2 text-right whitespace-nowrap">
                  up to {formatUsdc((cap * BigInt(Math.round(s.payoutPercent))) / 100n)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <List title="In scope" items={rules.inScope} />
        <List title="Out of scope" items={rules.outOfScope} />
        <List title="A valid report includes" items={rules.validCriteria} />
        <List title="Treated as slop (deposit kept)" items={rules.slopSignals} />
      </div>
      <p className="text-xs text-ink-muted">
        Rules version {published.version}. Your report is judged by the version in force when you file it.
      </p>
    </Card>
  );
}
