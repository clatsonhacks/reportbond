"use client";

import { useWithdrawals } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Amount, Empty, ExplorerLink, Loading, Notice } from "./ui";

export function WithdrawalHistory({ account }: { account?: string }) {
  const { data, isLoading, error } = useWithdrawals(account);

  if (isLoading) return <Loading />;
  if (error) return <Notice tone="slashed">Could not load withdrawals: {error.message}</Notice>;
  if (!data?.withdrawals.length) return <Empty>No withdrawals yet.</Empty>;

  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
      {data.withdrawals.map((w, i) => (
        <li key={i} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
          <Amount value={w.amount ?? "0"} className="font-medium" />
          <span className="text-ink-muted">{formatDate(w.time)}</span>
          <ExplorerLink hash={w.tx} />
        </li>
      ))}
    </ul>
  );
}
