import { Status } from "@/lib/eip712";

// Never colour alone: every status has a label and an icon too.
const styles: Record<number, { label: string; icon: string; cls: string }> = {
  [Status.Submitted]: { label: "Waiting", icon: "◔", cls: "bg-waiting-bg text-waiting" },
  [Status.Acknowledged]: { label: "Acknowledged", icon: "◑", cls: "bg-waiting-bg text-waiting" },
  [Status.Valid]: { label: "Valid", icon: "✓", cls: "bg-returned-bg text-returned" },
  [Status.Mistake]: { label: "Honest mistake", icon: "↺", cls: "bg-returned-bg text-returned" },
  [Status.Slop]: { label: "Slop", icon: "✕", cls: "bg-slashed-bg text-slashed" },
  [Status.Refunded]: { label: "Refunded", icon: "↺", cls: "bg-returned-bg text-returned" },
};

export function StatusPill({ status }: { status: number }) {
  const s = styles[status] ?? { label: "Unknown", icon: "?", cls: "bg-surface text-ink-muted" };
  return (
    <span className={`state-change inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-medium ${s.cls}`}>
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}

export function statusLabel(status: number): string {
  return styles[status]?.label ?? "Unknown";
}
