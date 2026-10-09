// GET /api/github/reports?pool=ID — the pool's private reports from GitHub and their deposit status.
// Only the pool creator (wallet sign-in) can see them: they reveal which advisories exist.
import { loadGithub } from "@/lib/server/db";
import { ensureFresh } from "@/lib/server/indexer";
import { signedInAddress } from "@/lib/server/session";
import { trackedView } from "@/lib/server/tracker";
import { bad, json } from "@/lib/server/views";

export async function GET(req: Request) {
  const poolId = new URL(req.url).searchParams.get("pool") ?? "";
  const wallet = await signedInAddress(req);
  if (!wallet) return bad("Sign in with your wallet", 401);
  const chain = await ensureFresh();
  const pool = chain.pools[poolId];
  if (!pool) return bad("Pool not found", 404);
  if (pool.creator !== wallet) return bad("Only the pool creator can see its GitHub reports", 403);

  const gh = await loadGithub();
  const verified = gh.verifiedPools[poolId];
  if (!verified) return json({ verified: false, reports: [] });

  const now = Math.floor(Date.now() / 1000);
  const reports = Object.values(gh.advisories)
    .filter((a) => a.repo === verified.repo)
    .sort((a, b) => b.reportedAt - a.reportedAt)
    .map((a) => trackedView(a, chain, now));
  return json({ verified: true, repo: verified.repo, reports });
}
