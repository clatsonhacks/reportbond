// Checks that a pasted advisory link is a GitHub private advisory on this pool's repo.
import { advisoryHashOf, parseAdvisoryUrl, repoIdOf } from "@/lib/advisory";
import { loadPrivate } from "@/lib/server/db";
import { syncFresh } from "@/lib/server/indexer";
import { bad, json } from "@/lib/server/views";

export async function POST(req: Request) {
  const { poolId, url } = (await req.json().catch(() => ({}))) as { poolId?: number; url?: string };
  const parsed = url ? parseAdvisoryUrl(url) : null;
  if (!parsed) {
    return bad(
      "That isn't a GitHub advisory link. It should look like github.com/owner/repo/security/advisories/GHSA-xxxx-xxxx-xxxx",
    );
  }
  const d = await syncFresh(); // fresh, so a just-filed duplicate is caught
  const pool = d.pools[String(poolId)];
  if (!pool) return bad("Pool not found", 404);
  const repo = `${parsed.owner}/${parsed.repo}`;
  if (repoIdOf(repo) !== pool.repoId) {
    const expected = (await loadPrivate()).repoNames[pool.id];
    return bad(`This advisory is on ${repo}, but this pool is for ${expected ?? "a different repo"}.`);
  }
  const advisoryHash = advisoryHashOf(parsed.url);
  const duplicate = Object.values(d.reports).find((r) => r.advisoryHash === advisoryHash && r.status <= 2);
  if (duplicate) return bad(`This advisory already has an open report (#${duplicate.id}).`);
  return json({ ok: true, repo, ghsa: parsed.ghsa, url: parsed.url, advisoryHash });
}
