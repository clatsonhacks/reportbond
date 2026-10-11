"use client";

// The pool creator's control over automatic slop rejection: on or off, and how sure the AI must be.
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { post } from "@/lib/api";
import { AUTO_SLOP_DEFAULT, AUTO_SLOP_MIN } from "@/lib/delegate";
import type { PoolView } from "@/lib/types";
import { useSignIn } from "@/lib/useSignIn";
import { Button, Card, Notice } from "./ui";

/** The slider itself, shared with the create-pool form. */
export function SlopThreshold({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="flex items-baseline justify-between text-sm">
        <span>Reject when the AI is at least this sure a report is slop</span>
        <span className="num font-semibold">{value}%</span>
      </span>
      <input
        type="range"
        min={AUTO_SLOP_MIN}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--accent)]"
        aria-label="Slop confidence needed for automatic rejection, percent"
      />
      <span className="flex justify-between text-xs text-ink-muted">
        <span>{AUTO_SLOP_MIN}% (rejects more)</span>
        <span>100% (rejects only certain slop)</span>
      </span>
    </label>
  );
}

export function AutoSlopSettings({ pool }: { pool: PoolView }) {
  const signIn = useSignIn();
  const qc = useQueryClient();
  const [on, setOn] = useState(pool.autoSlop !== null);
  const [threshold, setThreshold] = useState(pool.autoSlop?.threshold ?? AUTO_SLOP_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "returned" | "slashed"; text: string } | null>(null);
  const changed = on !== (pool.autoSlop !== null) || (on && threshold !== pool.autoSlop?.threshold);
  // A pool created without the option has a plain wallet as signer: the AI can't sign for it.
  const canReject = pool.signerOwner !== null || pool.autoSlop?.active;

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await post(`/api/pools/${pool.id}/auto-slop`, { threshold: on ? threshold : null }, { authorization: `Bearer ${await signIn()}` });
      await qc.invalidateQueries({ queryKey: ["pool", String(pool.id)] });
      setMessage({ tone: "returned", text: on ? `Saved: slop at ${threshold}% or more is handled automatically.` : "Automatic rejection is off." });
    } catch (e) {
      setMessage({ tone: "slashed", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-semibold">Automatic slop rejection</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Every paid report is reviewed by two AI reviewers. When both agree it is slop and are at least as sure as you set
          here, {canReject ? "it is rejected without waiting for you and the deposit goes to your pool" : "it is flagged for you"}.
          Anything less certain always waits for your decision, and the AI can never mark a report valid or pay a bounty.
        </p>
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} className="h-4 w-4" />
        {canReject ? "Reject clear slop automatically" : "Flag clear slop"}
      </label>
      {on && <SlopThreshold value={threshold} onChange={setThreshold} disabled={busy} />}
      {!canReject && (
        <p className="text-xs text-ink-muted">
          This pool was created with a plain wallet as its verdict signer, which can&apos;t be changed, so the AI can only
          flag reports here. Pools created with automatic rejection turned on can reject on their own.
        </p>
      )}
      <Button variant="secondary" onClick={save} disabled={busy || !changed}>
        {busy ? "Saving…" : "Save"}
      </Button>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
    </Card>
  );
}
