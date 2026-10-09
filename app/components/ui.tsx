import Link from "next/link";
import { formatUsdc } from "@/lib/format";
import { txUrl } from "@/lib/network";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-3xl border border-line bg-card p-6 shadow-minimal sm:p-8 ${className}`}>{children}</section>;
}

const buttonBase =
  "inline-flex items-center justify-center gap-2.5 rounded-full px-6 py-3 text-sm font-medium tracking-tight state-change disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-offset-2";

export const buttonStyles = {
  primary: `${buttonBase} bg-ink text-card shadow-minimal-lg hover:shadow-minimal-xl active:scale-[0.98] focus-visible:ring-ink/20`,
  secondary: `${buttonBase} border-2 border-ink/10 bg-card text-ink shadow-minimal hover:border-ink/20 hover:shadow-minimal-lg active:scale-[0.98] focus-visible:ring-ink/20`,
  danger: `${buttonBase} border-2 border-slashed/20 bg-slashed-bg text-slashed shadow-minimal hover:bg-slashed hover:text-white hover:border-slashed active:scale-[0.98] focus-visible:ring-slashed/20`,
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
  className = "",
}: {
  href: string;
  variant?: keyof typeof buttonStyles;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`${buttonStyles[variant]} ${className}`}>
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
    neutral: "border-line/50 bg-surface text-ink",
    returned: "border-returned/20 bg-returned-bg text-ink shadow-minimal",
    waiting: "border-waiting/20 bg-waiting-bg text-ink shadow-minimal",
    slashed: "border-slashed/20 bg-slashed-bg text-ink shadow-minimal",
  };
  return <div className={`rounded-2xl border px-5 py-4 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Row({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] items-baseline gap-x-4 gap-y-0.5 py-3 sm:grid-cols-[10rem_auto_1fr]">
      <dt className="text-xs uppercase tracking-wider text-ink-muted">{label}</dt>
      <dd className="text-lg font-semibold">{value}</dd>
      {note && <dd className="col-start-2 text-sm text-ink-muted sm:col-start-3">{note}</dd>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-line/50 bg-surface px-8 py-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface">
        <svg className="h-8 w-8 text-ink-muted/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
      </div>
      <p className="text-sm text-ink-muted">{children}</p>
    </div>
  );
}

export function Loading() {
  return <p className="text-ink-muted" aria-live="polite">Loading…</p>;
}
