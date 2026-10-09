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
};

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

export function trackedView(a: TrackedAdvisory, chain: ChainData, now: number): TrackedReportView {
  // The newest on-chain report for this advisory (a reporter may re-file after a refund).
  const onchain = Object.values(chain.reports)
    .filter((r) => r.advisoryHash === a.advisoryHash)
    .sort((x, y) => y.id - x.id)[0];
  const bondDeadline = a.reportedAt + BOND_WINDOW_SECONDS;
  return {
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
