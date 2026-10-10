// Builds the SECURITY.md a maintainer adds to their repository from the published rulebook.
// Deterministic: the same rules always produce the same file.
import { formatDuration, formatUsdc } from "./format";
import type { Rulebook } from "./rules";

export type SecurityMdPool = { id: number; repoName: string | null; depositAmount: string; maxPayout: string; timeout: number };

const list = (items: string[]) => items.map((i) => `- ${i}`).join("\n");

export function securityMd(rules: Rulebook, pool: SecurityMdPool, siteUrl: string): string {
  const cap = BigInt(pool.maxPayout);
  const poolUrl = `${siteUrl.replace(/\/$/, "")}/pool/${pool.id}`;
  const rows = [...rules.severity]
    .reverse()
    .map((s) => {
      const amount = (cap * BigInt(Math.round(s.payoutPercent))) / 100n;
      const level = s.level[0].toUpperCase() + s.level.slice(1);
      return `| ${level} | ${s.description.replaceAll("|", "\\|")} | up to ${formatUsdc(amount)} |`;
    })
    .join("\n");

  return `# Security Policy

${rules.summary}

## Reporting a vulnerability

1. Report privately through GitHub: **Security → Report a vulnerability** on this repository. Please don't open a public issue.
2. Pay the refundable deposit of **${formatUsdc(BigInt(pool.depositAmount))}** at ${poolUrl}, using the link to your report.

We respond within **${formatDuration(pool.timeout)}**. If we don't, anyone can return your deposit, and it doesn't depend on us.

| Our verdict | What it means | Your deposit |
|---|---|---|
| Valid | A real vulnerability | Returned, plus a bounty |
| Mistake | An honest report that isn't a vulnerability | Returned |
| Slop | Low-effort or fabricated | Kept, and used to pay future valid reports |

Reports without a deposit are handled last, or not at all.

## What a good report includes

${list(rules.validCriteria)}

## In scope

${list(rules.inScope)}

## Out of scope

${list(rules.outOfScope)}

## Bounties

| Severity | What it looks like here | Bounty |
|---|---|---|
${rows}

Bounties are paid in USDC from the pool at ${poolUrl}.

## Reports we treat as slop

${list(rules.slopSignals)}

---

Deposits and bounties are handled by [ReportBond](${poolUrl}): the money sits in a contract nobody can reach into, and verdicts are signed by the maintainers.
`;
}

/** GitHub's "create new file" page with SECURITY.md pre-filled, so the maintainer commits it themselves. */
export function newFileUrl(repo: string, branch: string, content: string): string {
  const q = new URLSearchParams({ filename: "SECURITY.md", value: content });
  return `https://github.com/${repo}/new/${encodeURIComponent(branch)}?${q}`;
}
