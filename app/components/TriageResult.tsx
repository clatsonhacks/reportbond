// What the AI reviewers found for one report. A recommendation only: the maintainer signs the verdict.
import type { GroundingItem, TriageRun } from "@/lib/rules";

const verdictStyle = {
  valid: { label: "Valid", cls: "bg-returned-bg text-returned" },
  mistake: { label: "Honest mistake", cls: "bg-returned-bg text-returned" },
  slop: { label: "Slop", cls: "bg-slashed-bg text-slashed" },
} as const;

const evidenceStyle = {
  supported: { label: "Supported", cls: "text-returned" },
  contradicted: { label: "Contradicted", cls: "text-slashed" },
  unverifiable: { label: "Couldn't verify", cls: "text-ink-muted" },
} as const;

function Refs({ title, items }: { title: string; items: GroundingItem[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((i) => (
          <li key={i.ref} className="num break-all">
            <span className={i.status === "missing" ? "text-slashed" : i.status === "found" ? "text-returned" : "text-ink-muted"}>
              {i.status === "missing" ? "✕ not found" : i.status === "found" ? "✓ exists" : "? unchecked"}
            </span>{" "}
            {i.ref}
            {i.detail && <span className="text-ink-muted"> ({i.detail})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TriageResult({ run }: { run: TriageRun }) {
  if (run.error) {
    return <p className="rounded-2xl border border-line bg-surface p-3 text-sm text-slashed">AI review failed: {run.error}</p>;
  }
  const rec = run.recommendation;
  const g = run.grounding;
  const checked = [...g.paths, ...g.lines, ...g.symbols];
  const missing = checked.filter((i) => i.status === "missing").length;
  const found = checked.filter((i) => i.status === "found").length;

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-3 text-sm">
      {rec && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">AI recommends</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${verdictStyle[rec.verdict].cls}`}>
            {verdictStyle[rec.verdict].label}
          </span>
          <span className="num text-xs text-ink-muted">{Math.round(rec.confidence * 100)}% confident</span>
          {rec.verdict === "valid" && rec.severity !== "none" && (
            <span className="text-xs text-ink-muted">
              · <span className="capitalize">{rec.severity}</span> severity, {rec.suggestedBountyPercent}% of the cap
            </span>
          )}
        </div>
      )}
      {run.autoVerdict && (
        <p className="font-medium text-slashed">
          Rejected automatically: both reviewers rated it {run.autoVerdict.score}% likely to be slop, at or above this
          pool&apos;s {run.autoVerdict.threshold}% threshold.
        </p>
      )}
      {run.triage && <p>{run.triage.summary}</p>}
      {rec && <p className={rec.needsHuman ? "text-waiting" : "text-ink-muted"}>{rec.reason}</p>}
      {(run.triage?.injectionSuspected || run.critic?.injectionSuspected) && (
        <p className="text-slashed">
          ⚠ This report contains text that tries to instruct the reviewer. The reviewers ignored it; read the report yourself.
        </p>
      )}

      <p className="text-ink-muted">
        Code references:{" "}
        {g.missingShare === null ? (
          "the report cites nothing that could be checked."
        ) : (
          <>
            <span className="text-returned">{found} exist</span>, <span className={missing ? "text-slashed" : ""}>{missing} don&apos;t exist</span> in the repository.
          </>
        )}
      </p>

      <details>
        <summary className="cursor-pointer font-medium">Evidence and details</summary>
        <div className="mt-2 space-y-3 text-xs">
          {run.triage?.evidence.length ? (
            <ul className="space-y-2">
              {run.triage.evidence.map((e, i) => (
                <li key={i}>
                  <span className={`font-semibold ${evidenceStyle[e.status].cls}`}>{evidenceStyle[e.status].label}:</span> {e.claim}
                  <span className="block text-ink-muted">
                    {e.detail}
                    {e.file && <span className="num"> [{e.file}]</span>}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {run.investigation && run.investigation.steps.length > 0 && (
            <div>
              <p className="font-medium">What the reviewer looked at ({run.investigation.steps.length} steps)</p>
              <ol className="mt-0.5 list-decimal space-y-0.5 pl-5">
                {run.investigation.steps.map((s, i) => (
                  <li key={i} className="num break-all">
                    {s.tool} <span className="text-ink-muted">{s.input}</span>
                    {!s.ok && <span className="text-slashed"> (failed)</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <Refs title="Files cited" items={g.paths} />
          <Refs title="Line numbers cited" items={g.lines} />
          <Refs title="Functions and identifiers cited" items={g.symbols} />
          {run.critic && (
            <div>
              <p className="font-medium">
                Second reviewer: {run.critic.agrees ? "agrees" : "disagrees"} ({Math.round(run.critic.confidence * 100)}% confident)
              </p>
              {run.critic.issues.length > 0 && (
                <ul className="mt-0.5 list-disc pl-5 text-ink-muted">
                  {run.critic.issues.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="text-ink-muted">
            Reviewed {new Date(run.at * 1000).toLocaleString("en-GB")} by {run.model}, against rules version {run.rulesVersion}.
          </p>
        </div>
      </details>
    </div>
  );
}
