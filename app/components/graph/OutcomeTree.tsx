// The literal branching diagram: one report, four possible outcomes, the one that actually happened
// (if any) highlighted. While a report is still open (Submitted/Acknowledged), no branch is highlighted —
// nothing has happened yet.
import { Status } from "@/lib/eip712";
import { formatUsdc } from "@/lib/format";

const WIDTH = 420;
const ROOT = { x: WIDTH / 2, y: 28 };
const LEAF_Y = 230;
const LEAF_W = 92;
const LEAF_H = 56;

// Literal class strings, not interpolated: Tailwind only generates classes it can see as whole strings.
const styles: Record<number, { stroke: string; rect: string; label: string; amount: string }> = {
  [Status.Valid]: { stroke: "var(--valid)", rect: "fill-valid-bg stroke-valid", label: "fill-valid-text", amount: "fill-valid-text" },
  [Status.Mistake]: { stroke: "var(--mistake)", rect: "fill-mistake-bg stroke-mistake", label: "fill-mistake-text", amount: "fill-mistake-text" },
  [Status.Slop]: { stroke: "var(--slop)", rect: "fill-slop-bg stroke-slop", label: "fill-slop-text", amount: "fill-slop-text" },
  [Status.Refunded]: { stroke: "var(--refunded)", rect: "fill-refunded-bg stroke-refunded", label: "fill-refunded-text", amount: "fill-refunded-text" },
};
const dimmed = { rect: "fill-card stroke-line", label: "fill-ink", amount: "fill-ink-muted" };

function branches(deposit: bigint, maxPayout: bigint) {
  return [
    { status: Status.Valid, label: "Valid", amount: `+${formatUsdc(deposit + maxPayout)}`, x: 50 },
    { status: Status.Mistake, label: "Honest mistake", amount: `+${formatUsdc(deposit)}`, x: 150 },
    { status: Status.Slop, label: "Slop", amount: formatUsdc(0n), x: 270 },
    { status: Status.Refunded, label: "No response", amount: `+${formatUsdc(deposit)}`, x: 370 },
  ];
}

export function OutcomeTree({ status, deposit, maxPayout }: { status: number; deposit: bigint; maxPayout: bigint }) {
  const decided = status === Status.Valid || status === Status.Mistake || status === Status.Slop || status === Status.Refunded;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${LEAF_Y + LEAF_H + 10}`}
      className="mx-auto block h-auto w-full max-w-lg"
      role="img"
      aria-label="Possible outcomes for this report"
    >
      {branches(deposit, maxPayout).map((b) => {
        const active = decided && b.status === status;
        return (
          <path
            key={b.status}
            d={`M ${ROOT.x} ${ROOT.y + 14} C ${ROOT.x} ${ROOT.y + 90}, ${b.x} ${LEAF_Y - 70}, ${b.x} ${LEAF_Y}`}
            fill="none"
            stroke={active ? styles[b.status].stroke : "var(--line)"}
            strokeWidth={active ? 2.5 : 1.5}
            opacity={decided && !active ? 0.35 : 1}
          />
        );
      })}
      <circle cx={ROOT.x} cy={ROOT.y} r={14} className="fill-ink" />
      <text x={ROOT.x} y={ROOT.y + 32} textAnchor="middle" className="text-xs font-medium" fill="var(--ink-muted)">
        Report
      </text>
      {branches(deposit, maxPayout).map((b) => {
        const active = decided && b.status === status;
        const s = active ? styles[b.status] : dimmed;
        return (
          <g key={b.status} opacity={decided && !active ? 0.4 : 1}>
            <rect x={b.x - LEAF_W / 2} y={LEAF_Y} width={LEAF_W} height={LEAF_H} rx={14} className={s.rect} strokeWidth={active ? 1.5 : 1} />
            <text x={b.x} y={LEAF_Y + 22} textAnchor="middle" className={`text-[11px] font-semibold ${s.label}`}>
              {b.label}
            </text>
            <text x={b.x} y={LEAF_Y + 40} textAnchor="middle" className={`num text-[11px] font-bold ${s.amount}`}>
              {b.amount}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
