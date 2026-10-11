"use client";

// Bounty rules for a pool: answer a few questions, let the setup agent draft the rulebook from the
// repository, edit it, publish it, and get a SECURITY.md and README badge.
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, post } from "@/lib/api";
import { formatUsdc } from "@/lib/format";
import { SEVERITIES, type PoolRulesView, type Rulebook } from "@/lib/rules";
import type { PoolView } from "@/lib/types";
import { useSignIn } from "@/lib/useSignIn";
import { Button, buttonStyles, Card, Notice } from "./ui";

const BLANK: Rulebook = {
  summary: "",
  inScope: [],
  outOfScope: [],
  severity: [
    { level: "low", description: "", payoutPercent: 10 },
    { level: "medium", description: "", payoutPercent: 25 },
    { level: "high", description: "", payoutPercent: 50 },
    { level: "critical", description: "", payoutPercent: 100 },
  ],
  validCriteria: [],
  slopSignals: [],
};

const QUESTIONS = [
  { key: "about", label: "What does the project do, and who uses it?", placeholder: "An HTTP header parser in C, used in proxies. It parses untrusted network input." },
  { key: "focus", label: "What do you most want reports about?", placeholder: "Memory-safety bugs reachable from network input." },
  { key: "exclude", label: "What don't you want reports about?", placeholder: "Tests, the build system, anything that needs local access." },
  { key: "payouts", label: "Anything about severity or payouts?", placeholder: "Critical gets the full cap; denial of service is medium at most." },
] as const;

type Published = { version: number; securityMd: string; commitUrl: string | null };

const field = "w-full rounded-[8px] border border-line bg-surface px-3 py-2 text-sm";
const lines = (xs: string[]) => xs.join("\n");
const tidy = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
/** Drop the blank lines left over from editing lists in a textarea. */
const cleaned = (r: Rulebook): Rulebook => ({
  ...r,
  inScope: tidy(r.inScope),
  outOfScope: tidy(r.outOfScope),
  validCriteria: tidy(r.validCriteria),
  slopSignals: tidy(r.slopSignals),
});

export function RulesEditor({ pool, required = false }: { pool: PoolView; required?: boolean }) {
  const signIn = useSignIn();
  const qc = useQueryClient();
  const [view, setView] = useState<PoolRulesView | null>(null);
  const [rules, setRules] = useState<Rulebook | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [published, setPublished] = useState<Published | null>(null);

  const cap = BigInt(pool.maxPayout);
  const auth = async () => ({ authorization: `Bearer ${await signIn()}` });

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const open = () =>
    run("open", async () => {
      const v = await api<PoolRulesView>(`/api/pools/${pool.id}/rules`, { headers: await auth() });
      setView(v);
      setRules(v.draft ?? null);
    });

  const draft = () =>
    run("draft", async () => {
      const res = await post<{ rules: Rulebook; sources?: string[] }>(`/api/pools/${pool.id}/rules/draft`, answers, await auth());
      setRules(res.rules);
      const found = res.sources?.length ? ` It used the policy already in the repository (${res.sources.join(", ")}).` : "";
      setNotice(`Draft written from your answers and the repository.${found} Check every line: it's your policy, not the AI's.`);
    });

  const save = () =>
    run("save", async () => {
      const res = await api<{ problems: string[] }>(`/api/pools/${pool.id}/rules`, {
        method: "PUT",
        body: JSON.stringify({ rules: cleaned(rules!) }),
        headers: await auth(),
      });
      setNotice(res.problems.length ? `Saved. Before publishing: ${res.problems.join(" ")}` : "Draft saved.");
    });

  const publish = () =>
    run("publish", async () => {
      const headers = await auth();
      const final = cleaned(rules!);
      await api(`/api/pools/${pool.id}/rules`, { method: "PUT", body: JSON.stringify({ rules: final }), headers });
      const res = await post<Published>(`/api/pools/${pool.id}/rules/publish`, {}, headers);
      setPublished(res);
      setRules(null);
      setView((v) => (v ? { ...v, draft: null, published: { version: res.version, publishedAt: Date.now() / 1000, rules: final } } : v));
      qc.invalidateQueries({ queryKey: ["pool-rules", String(pool.id)] });
      // The pool opens for reports the moment its first rules are published.
      qc.invalidateQueries({ queryKey: ["pool", String(pool.id)] });
    });

  const set = <K extends keyof Rulebook>(key: K, value: Rulebook[K]) => setRules((r) => (r ? { ...r, [key]: value } : r));

  // When rules are the step that opens the pool, go straight to the editor.
  useEffect(() => {
    if (required && !view && busy === null) void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the pool first needs rules
  }, [required]);

  if (!view) {
    return (
      <Card className="space-y-3">
        <h2 className="font-semibold">Bounty rules</h2>
        <p className="text-sm text-ink-muted">
          What&apos;s in scope, what each severity pays, and what counts as slop. Reporters read them before reporting, and
          the AI reviewers judge reports against them.
        </p>
        <Button variant="secondary" onClick={open} disabled={busy !== null}>
          {busy === "open" ? "Opening…" : "Manage bounty rules"}
        </Button>
        {error && <Notice tone="slashed">{error}</Notice>}
      </Card>
    );
  }

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const badge = `[![Bug bounty](${origin}/api/badge/${pool.id})](${origin}/pool/${pool.id})`;

  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Bounty rules</h2>
        <span className="text-sm text-ink-muted">
          {view.published ? `Version ${view.published.version} is live` : required ? "Required before the pool opens" : "Not published yet"}
        </span>
      </div>

      {published && (
        <div className="space-y-3">
          <Notice tone="returned">
            Version {published.version} is published. Add the policy to your repository so reporters find it.
          </Notice>
          <div className="flex flex-wrap gap-2">
            {published.commitUrl && (
              <a className={buttonStyles.primary} href={published.commitUrl} target="_blank" rel="noreferrer">
                Add SECURITY.md on GitHub ↗
              </a>
            )}
            <Button variant="secondary" onClick={() => navigator.clipboard.writeText(published.securityMd)}>
              Copy SECURITY.md
            </Button>
          </div>
          <details className="rounded-[8px] border border-line bg-surface p-3">
            <summary className="cursor-pointer text-sm font-medium">Preview SECURITY.md</summary>
            <pre className="num mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs">{published.securityMd}</pre>
          </details>
          <div className="space-y-1">
            <p className="text-sm font-medium">README badge</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- a live SVG served by our own API */}
            <img src={`/api/badge/${pool.id}`} alt="Bug bounty badge" height={20} />
            <pre className="num overflow-x-auto rounded-[8px] border border-line bg-surface p-2 text-xs">{badge}</pre>
          </div>
        </div>
      )}

      {!rules ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            {view.published
              ? "Edit the live rules, or have the AI redraft them from the repository."
              : "Answer a few questions and the AI drafts the rules from your repository. If the repository already has a rules file (RULES.md, BOUNTY.md or SECURITY.md), the draft starts from it. You edit and approve everything before it's published."}
          </p>
          {QUESTIONS.map((q) => (
            <label key={q.key} className="block space-y-1">
              <span className="text-sm font-medium">{q.label}</span>
              <textarea
                className={field}
                rows={2}
                placeholder={q.placeholder}
                value={answers[q.key] ?? ""}
                onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
              />
            </label>
          ))}
          {!pool.verifiedBy && (
            <Notice tone="waiting">Verify this pool with GitHub first, so the AI can read the repository.</Notice>
          )}
          {!view.aiConfigured && <Notice tone="waiting">The AI isn&apos;t set up on this site. You can still write the rules by hand.</Notice>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={draft} disabled={busy !== null || !pool.verifiedBy || !view.aiConfigured}>
              {busy === "draft" ? "Reading the repository…" : "Draft rules with AI"}
            </Button>
            <Button variant="secondary" onClick={() => setRules(view.published?.rules ?? BLANK)} disabled={busy !== null}>
              {view.published ? "Edit the live rules" : "Write them by hand"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Summary</span>
            <textarea className={field} rows={3} value={rules.summary} onChange={(e) => set("summary", e.target.value)} />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["inScope", "In scope"],
                ["outOfScope", "Out of scope"],
                ["validCriteria", "A valid report includes"],
                ["slopSignals", "Treated as slop"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block space-y-1">
                <span className="text-sm font-medium">{label}</span>
                <textarea className={field} rows={6} value={lines(rules[key])} onChange={(e) => set(key, e.target.value.split("\n"))} />
                <span className="block text-xs text-ink-muted">One per line.</span>
              </label>
            ))}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Severity and bounty</p>
            <p className="text-xs text-ink-muted">
              Each level pays a share of this pool&apos;s cap of {formatUsdc(cap)} per report.
            </p>
            {SEVERITIES.map((level) => {
              const row = rules.severity.find((s) => s.level === level) ?? { level, description: "", payoutPercent: 0 };
              const update = (patch: Partial<typeof row>) =>
                set("severity", SEVERITIES.map((l) => (l === level ? { ...row, ...patch } : rules.severity.find((s) => s.level === l) ?? { level: l, description: "", payoutPercent: 0 })));
              return (
                <div key={level} className="grid grid-cols-[5rem_1fr_5.5rem_6.5rem] items-center gap-2 text-sm">
                  <span className="font-medium capitalize">{level}</span>
                  <input className={field} value={row.description} onChange={(e) => update({ description: e.target.value })} aria-label={`${level}: what it looks like`} placeholder="What it looks like in this project" />
                  <span className="flex items-center gap-1">
                    <input className={`${field} num`} inputMode="numeric" value={row.payoutPercent} onChange={(e) => update({ payoutPercent: Number(e.target.value.replace(/\D/g, "")) || 0 })} aria-label={`${level}: share of the cap, percent`} />
                    %
                  </span>
                  <span className="num text-ink-muted">{formatUsdc((cap * BigInt(Math.min(100, Math.max(0, Math.round(row.payoutPercent))))) / 100n)}</span>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={publish} disabled={busy !== null}>
              {busy === "publish" ? "Publishing…" : view.published ? `Publish as version ${view.published.version + 1}` : "Publish rules"}
            </Button>
            <Button variant="secondary" onClick={save} disabled={busy !== null}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </Button>
            <Button variant="secondary" onClick={() => setRules(null)} disabled={busy !== null}>
              Close
            </Button>
          </div>
          <p className="text-xs text-ink-muted">
            Publishing makes these the rules for new reports. Reports already filed keep the version they were filed under.
          </p>
        </div>
      )}

      {notice && <Notice tone="returned">{notice}</Notice>}
      {error && <Notice tone="slashed">{error}</Notice>}
    </Card>
  );
}
