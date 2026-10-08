// GitHub private advisory links: github.com/{owner}/{repo}/security/advisories/GHSA-xxxx-xxxx-xxxx
import { keccak256, toBytes } from "viem";

const ADVISORY_RE =
  /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100})\/security\/advisories\/(GHSA(?:-[23456789cfghjmpqrvwx]{4}){3})\/?$/i;

export type ParsedAdvisory = { owner: string; repo: string; ghsa: string; url: string };

export function parseAdvisoryUrl(input: string): ParsedAdvisory | null {
  const m = input.trim().match(ADVISORY_RE);
  if (!m) return null;
  const [, owner, repo, ghsa] = m;
  // Canonical form, so the same advisory always hashes the same.
  const url = `https://github.com/${owner}/${repo}/security/advisories/${ghsa}`.toLowerCase();
  return { owner: owner.toLowerCase(), repo: repo.toLowerCase(), ghsa: ghsa.toUpperCase(), url };
}

/** keccak256("owner/repo"), lowercased. */
export function repoIdOf(fullName: string): `0x${string}` {
  return keccak256(toBytes(fullName.trim().toLowerCase()));
}

/** keccak256 of the canonical advisory link. Only this goes on-chain. */
export function advisoryHashOf(url: string): `0x${string}` {
  const parsed = parseAdvisoryUrl(url);
  if (!parsed) throw new Error("Not a GitHub advisory link");
  return keccak256(toBytes(parsed.url));
}
