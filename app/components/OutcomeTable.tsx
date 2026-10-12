import { formatUsdc } from "@/lib/format";

/** What a deposit becomes under each verdict. Slop reads 0.00: the deposit is already gone, so there's
 * nothing more to show (a negative number on top would double-count the loss). */
export function OutcomeTable({ deposit, maxPayout, timeoutLabel }: { deposit: bigint; maxPayout: bigint; timeoutLabel: string }) {
  const rows = [
    { label: "Valid", amount: `+${formatUsdc(deposit + maxPayout)}`, cls: "bg-valid-bg text-valid-text" },
    { label: "Honest mistake", amount: `+${formatUsdc(deposit)}`, cls: "bg-mistake-bg text-mistake-text" },
    { label: `No response in ${timeoutLabel}`, amount: `+${formatUsdc(deposit)}`, cls: "bg-refunded-bg text-refunded-text" },
    { label: "Slop", amount: formatUsdc(0n), cls: "bg-slop-bg text-slop-text" },
  ];
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-sm ${r.cls}`}>
          <span className="font-medium">{r.label}</span>
          <span className="num font-semibold">{r.amount}</span>
        </div>
      ))}
    </div>
  );
}
