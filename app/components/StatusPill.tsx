import { Status } from "@/lib/eip712";
import type { ReactElement } from "react";

function WaitingIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="2" />
      <path d="M6 3V6L8 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ReturnIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 3H4C2.89543 3 2 3.89543 2 5V7C2 8.10457 2.89543 9 4 9H8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 5L4 3L6 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="2" />
      <path d="M6 8.5V9M6 4C5.5 4 5 4.5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// Never colour alone: every status has a label and an icon too.
const styles: Record<number, { label: string; Icon: () => ReactElement; cls: string; border: string }> = {
  [Status.Submitted]: { label: "Waiting", Icon: WaitingIcon, cls: "bg-waiting-bg text-waiting", border: "border-waiting/30" },
  [Status.Acknowledged]: { label: "Acknowledged", Icon: WaitingIcon, cls: "bg-waiting-bg text-waiting", border: "border-waiting/30" },
  [Status.Valid]: { label: "Valid", Icon: CheckIcon, cls: "bg-returned-bg text-returned", border: "border-returned/30" },
  [Status.Mistake]: { label: "Honest mistake", Icon: ReturnIcon, cls: "bg-returned-bg text-returned", border: "border-returned/30" },
  [Status.Slop]: { label: "Slop", Icon: XIcon, cls: "bg-slashed-bg text-slashed", border: "border-slashed/30" },
  [Status.Refunded]: { label: "Refunded", Icon: ReturnIcon, cls: "bg-returned-bg text-returned", border: "border-returned/30" },
};

export function StatusPill({ status }: { status: number }) {
  const s = styles[status] ?? { label: "Unknown", Icon: QuestionIcon, cls: "bg-surface text-ink-muted", border: "border-line" };
  return (
    <span className={`state-change inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-medium tracking-tight ${s.cls} ${s.border}`}>
      <s.Icon />
      {s.label}
    </span>
  );
}

export function statusLabel(status: number): string {
  return styles[status]?.label ?? "Unknown";
}
