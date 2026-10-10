// Report tracker: private vulnerability reports received from GitHub, matched to on-chain deposits.
import "server-only";
import { advisoryHashOf, parseAdvisoryUrl } from "../advisory";
import type { ChainData, GithubData, TrackedAdvisory } from "./db";

/** Hours a reporter has to pay the deposit after filing on GitHub (per-pool rules come in a later phase). */
export const BOND_WINDOW_SECONDS = Number(process.env.BOND_WINDOW_HOURS ?? 48) * 3600;

export type BondStatus = "bonded" | "awaiting" | "unbonded";

export type TrackedReportView = {
  ghsa: string;
  url: string;
  reporter: string | null;
  githubState: string;
  reportedAt: number;
  bond: BondStatus;
  bondDeadline: number;
  reportId: number | null;
  status: number | null; // on-chain report status, if bonded
  synced: boolean;
  syncError: string | null;
  /** Wallet that paid the deposit, and the GitHub account linked to it, if any. */
  depositor: string | null;
  depositorLogin: string | null;
  /**
   * Whether the deposit was paid by the person who filed the report on GitHub:
   * "match", "mismatch" (the wallet is linked to a different account), or "unknown" (not linked, or no deposit).
   */
  reporterMatch: "match" | "mismatch" | "unknown";
  title: string | null;
  /** The filer's earlier outcomes on this site, across all pools, by GitHub account. */
  history: { valid: number; mistake: number; slop: number };
  /** Short labels a maintainer can sort their attention by. */
  tags: { label: string; tone: "good" | "warn" | "bad" | "neutral" }[];
};

/** Earlier verdicts on reports filed by one GitHub account (other than `except`). */
export function reporterHistory(login: string | null, gh: GithubData | undefined, chain: ChainData, except?: string) {
  const h = { valid: 0, mistake: 0, slop: 0 };
  if (!login || !gh) return h;
  const statusByHash = new Map<string, number>();
  for (const r of Object.values(chain.reports)) statusByHash.set(r.advisoryHash, r.status);
  for (const a of Object.values(gh.advisories)) {
    if (a.reporter !== login || a.ghsa === except) continue;
    const s = statusByHash.get(a.advisoryHash);
    if (s === 3) h.valid++;
    else if (s === 4) h.mistake++;
    else if (s === 5) h.slop++;
  }
  return h;
}

/** Builds a tracked advisory from a repository_advisory webhook payload. */
export function trackedFromWebhook(
  advisory: { ghsa_id: string; html_url: string; state: string; created_at?: string; author?: { login: string } | null },
  repoFullName: string,
  sender: string | null,
): TrackedAdvisory | null {
  const parsed = parseAdvisoryUrl(advisory.html_url);
  if (!parsed) return null;
  const now = Math.floor(Date.now() / 1000);
  return {
    ghsa: parsed.ghsa,
    repo: repoFullName.toLowerCase(),
    url: parsed.url,
    advisoryHash: advisoryHashOf(parsed.url),
    reporter: (advisory.author?.login ?? sender)?.toLowerCase() ?? null,
    githubState: advisory.state,
    reportedAt: advisory.created_at ? Math.floor(Date.parse(advisory.created_at) / 1000) : now,
    updatedAt: now,
  };
}

export function trackedView(a: TrackedAdvisory, chain: ChainData, now: number, gh?: GithubData, feePaid = false): TrackedReportView {
  // The newest on-chain report for this advisory (a reporter may re-file after a refund).
  const onchain = Object.values(chain.reports)
    .filter((r) => r.advisoryHash === a.advisoryHash)
    .sort((x, y) => y.id - x.id)[0];
  const bondDeadline = a.reportedAt + BOND_WINDOW_SECONDS;
  const depositorLogin = onchain ? (gh?.walletLinks?.[onchain.reporter]?.login ?? null) : null;
  const reporterMatch = !depositorLogin || !a.reporter ? "unknown" : depositorLogin === a.reporter ? "match" : "mismatch";
  const history = reporterHistory(a.reporter, gh, chain, a.ghsa);
  const tags: TrackedReportView["tags"] = [];
  if (history.valid > 0 && history.slop === 0) tags.push({ label: `Trusted reporter · ${history.valid} valid`, tone: "good" });
  else if (history.slop > 0 && history.slop >= history.valid) tags.push({ label: `Flagged · ${history.slop} slop before`, tone: "bad" });
  else if (history.valid + history.mistake + history.slop === 0) tags.push({ label: "First report here", tone: "neutral" });
  if (reporterMatch === "match") tags.push({ label: "Paid by the filer", tone: "good" });
  if (reporterMatch === "mismatch") tags.push({ label: "Paid by someone else", tone: "warn" });
  if (!onchain && now > bondDeadline) tags.push({ label: "No deposit", tone: "warn" });
  if (feePaid) tags.push({ label: "Filing fee paid", tone: "good" });
  return {
    title: a.title ?? null,
    history,
    tags,
    depositor: onchain?.reporter ?? null,
    depositorLogin,
    reporterMatch,
    ghsa: a.ghsa,
    url: a.url,
    reporter: a.reporter,
    githubState: a.githubState,
    reportedAt: a.reportedAt,
    bond: onchain ? "bonded" : now > bondDeadline ? "unbonded" : "awaiting",
    bondDeadline,
    reportId: onchain?.id ?? null,
    status: onchain?.status ?? null,
    synced: onchain ? a.syncedStatus === onchain.status : false,
    syncError: a.syncError ?? null,
  };
}

/** Repos with a verified pool, mapped to that pool's ID. */
export function verifiedRepoPools(gh: GithubData): Map<string, number> {
  const m = new Map<string, number>();
  for (const [id, v] of Object.entries(gh.verifiedPools)) m.set(v.repo, Number(id));
  return m;
}
