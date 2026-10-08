import Link from "next/link";
import { formatUsdc } from "@/lib/format";
import { txUrl } from "@/lib/network";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[8px] border border-line bg-card p-5 sm:p-6 ${className}`}>{children}</section>;
}

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-[8px] px-4 py-2.5 text-sm font-medium state-change disabled:cursor-not-allowed disabled:opacity-50";

export const buttonStyles = {
  primary: `${buttonBase} bg-accent text-accent-ink hover:opacity-90`,
  secondary: `${buttonBase} border border-line bg-card text-ink hover:bg-surface`,
  danger: `${buttonBase} border border-slashed text-slashed hover:bg-slashed-bg`,
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof buttonStyles }) {
  return <button {...props} className={`${buttonStyles[variant]} ${className}`} />;
}

export function ButtonLink({
  href,
  variant = "primary",
  children,
}: {
  href: string;
  variant?: keyof typeof buttonStyles;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={buttonStyles[variant]}>
      {children}
    </Link>
  );
}

export function Amount({ value, className = "" }: { value: bigint | string; className?: string }) {
  return <span className={`num ${className}`}>{formatUsdc(BigInt(value))}</span>;
}

export function ExplorerLink({ hash, label = "View on explorer" }: { hash: string; label?: string }) {
  const url = txUrl(hash);
  if (!url) return <span className="num text-xs text-ink-muted">{hash.slice(0, 10)}…</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-sm text-accent underline-offset-2 hover:underline"
      aria-label={`${label} (opens in a new tab)`}
      title={label}
    >
      ↗
    </a>
  );
}

export function Notice({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "returned" | "waiting" | "slashed";
  children: React.ReactNode;
}) {
  const tones = {
    neutral: "border-line bg-surface text-ink",
    returned: "border-returned/30 bg-returned-bg text-ink",
    waiting: "border-waiting/30 bg-waiting-bg text-ink",
    slashed: "border-slashed/30 bg-slashed-bg text-ink",
  };
  return <div className={`rounded-[8px] border px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Row({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-baseline gap-x-4 gap-y-0.5 py-2 sm:grid-cols-[10rem_auto_1fr]">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-lg font-medium">{value}</dd>
      {note && <dd className="col-start-2 text-sm text-ink-muted sm:col-start-3">{note}</dd>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[8px] border border-dashed border-line px-4 py-8 text-center text-ink-muted">{children}</p>;
}

export function Loading() {
  return <p className="text-ink-muted" aria-live="polite">Loading…</p>;
}
