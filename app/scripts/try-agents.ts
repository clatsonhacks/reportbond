// Try the agents on a real repository the GitHub App is installed on, with the real model.
//   pnpm try:agents owner/repo                        draft a rulebook for the repo
//   pnpm try:agents owner/repo report1.md report2.md  also review each report file against the repo
// A report file is markdown; its first line is the title. Nothing is stored in the app's data and
// nothing is sent on-chain: this only prints what the agents say.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "rb-try-"));
process.env.DATABASE_URL = "";

async function main() {
  const [repoArg, ...reportFiles] = process.argv.slice(2);
  if (!repoArg || !repoArg.includes("/")) throw new Error("Usage: pnpm try:agents owner/repo [report.md ...]");
  const repo = repoArg.toLowerCase();

  await import("../jobs/env");
  const { appJwt, installationGet } = await import("../lib/server/github");
  const { aiModel, aiProvider, tokensPerMinute } = await import("../lib/server/ai");
  const { draftRulebook } = await import("../lib/server/agents/setup");
  const { runTriage } = await import("../lib/server/agents/triage");

  // Find the installation that can see this repository.
  const res = await fetch(`${(process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "")}/app/installations`, {
    headers: { authorization: `Bearer ${appJwt()}`, accept: "application/vnd.github+json", "user-agent": "ReportBond" },
  });
  const installations = (await res.json()) as { id: number; account: { login: string } }[];
  if (!Array.isArray(installations)) throw new Error(`GitHub App not usable: ${JSON.stringify(installations).slice(0, 200)}`);
  let installationId = 0;
  for (const i of installations) {
    const r = await installationGet<{ repositories: { full_name: string }[] }>(i.id, "/installation/repositories?per_page=100");
    if (r.repositories.some((x) => x.full_name.toLowerCase() === repo)) installationId = i.id;
  }
  if (!installationId) throw new Error(`The GitHub App isn't installed on ${repo}. Installed for: ${installations.map((i) => i.account.login).join(", ") || "nobody"}`);

  const tpm = await tokensPerMinute();
  console.log(`Repository: ${repo} (installation ${installationId})`);
  console.log(`Model: ${aiProvider()} / ${aiModel()}${tpm ? `, plan limit ${tpm.toLocaleString("en-US")} tokens per minute` : ""}\n`);

  console.log("=== Setup agent: drafting the rulebook ===");
  const { rules } = await draftRulebook(installationId, repo, { about: "", focus: "", exclude: "", payouts: "" });
  console.log(`Summary: ${rules.summary}`);
  console.log(`In scope:\n${rules.inScope.map((x) => `  - ${x}`).join("\n")}`);
  console.log(`Out of scope:\n${rules.outOfScope.map((x) => `  - ${x}`).join("\n")}`);
  console.log(`Severity:\n${rules.severity.map((s) => `  - ${s.level} (${s.payoutPercent}%): ${s.description}`).join("\n")}`);
  console.log(`A valid report includes:\n${rules.validCriteria.map((x) => `  - ${x}`).join("\n")}`);
  console.log(`Slop signals:\n${rules.slopSignals.map((x) => `  - ${x}`).join("\n")}`);

  for (const file of reportFiles) {
    const text = readFileSync(file, "utf8");
    const [title, ...rest] = text.split("\n");
    console.log(`\n=== Triage: ${path.basename(file)} ===`);
    const run = await runTriage(
      installationId,
      repo,
      "GHSA-TRY0-TRY0-TRY0",
      { version: 1, publishedAt: 0, rules },
      { ghsa: "GHSA-TRY0-TRY0-TRY0", summary: title.replace(/^#+\s*/, ""), description: rest.join("\n"), severity: null, cwes: [], affected: [], state: "triage" },
    );
    if (run.error) {
      console.log(`Failed: ${run.error}`);
      continue;
    }
    const g = run.grounding;
    console.log(`Grounding: ${g.missingShare === null ? "nothing checkable cited" : `${Math.round(g.missingShare * 100)}% of cited code doesn't exist`}`);
    for (const i of [...g.paths, ...g.lines, ...g.symbols]) console.log(`  ${i.status.padEnd(9)} ${i.ref}${i.detail ? ` (${i.detail})` : ""}`);
    console.log(`Tools used (${run.investigation?.steps.length ?? 0}):`);
    for (const s of run.investigation?.steps ?? []) console.log(`  ${s.ok ? "ok  " : "FAIL"} ${s.tool} ${s.input}`);
    console.log(`Findings:\n${(run.investigation?.notes ?? "").split("\n").map((l) => `  ${l}`).join("\n")}`);
    console.log(`Verdict: ${run.triage?.verdict} (confidence ${run.triage?.confidence}, severity ${run.triage?.severity}, in scope ${run.triage?.inScope}, injection ${run.triage?.injectionSuspected})`);
    console.log(`Summary: ${run.triage?.summary}`);
    for (const e of run.triage?.evidence ?? []) console.log(`  [${e.status}] ${e.claim}\n      ${e.detail}${e.file ? ` [${e.file}]` : ""}`);
    console.log(`Critic: agrees ${run.critic?.agrees} (confidence ${run.critic?.confidence})${run.critic?.issues.length ? `\n  - ${run.critic.issues.join("\n  - ")}` : ""}`);
    console.log(`Recommendation: ${run.recommendation?.verdict}, ${Math.round((run.recommendation?.confidence ?? 0) * 100)}%. ${run.recommendation?.reason}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
