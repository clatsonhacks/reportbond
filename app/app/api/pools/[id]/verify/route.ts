// POST /api/pools/:id/verify { repo } — links a pool to a GitHub repo the creator administers.
// Needs both: a GitHub session that lists the repo as admin, and a wallet sign-in from the pool creator.
import { repoIdOf } from "@/lib/advisory";
import { updateGithub, updatePrivate } from "@/lib/server/db";
import { currentSession } from "@/lib/server/githubSession";
import { ensureFresh, syncFresh } from "@/lib/server/indexer";
import { signedInAddress } from "@/lib/server/session";
import { bad, json } from "@/lib/server/views";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo } = (await req.json().catch(() => ({}))) as { repo?: string };
  const name = repo?.trim().toLowerCase();
  if (!name) return bad("Choose a repository");

  const gh = await currentSession();
  if (!gh) return bad("Connect GitHub first", 401);
  const wallet = await signedInAddress(req);
  if (!wallet) return bad("Sign in with the wallet that created this pool", 401);

  let d = await ensureFresh();
  if (!d.pools[id]) d = await syncFresh(); // just created, maybe not indexed yet
  const pool = d.pools[id];
  if (!pool) return bad("Pool not found", 404);
  if (pool.creator !== wallet) return bad("Only the wallet that created this pool can verify it", 403);
  const ghRepo = gh.repos.find((r) => r.fullName === name);
  if (!ghRepo) return bad(`@${gh.login} isn't an admin of ${name}, or the ReportBond app isn't installed there`, 403);
  if (repoIdOf(name) !== pool.repoId) return bad(`This pool was created for a different repository than ${name}`);

  await updateGithub((g) => {
    g.verifiedPools[id] = { repo: name, login: gh.login, installationId: ghRepo.installationId, verifiedAt: Math.floor(Date.now() / 1000) };
  });
  await updatePrivate((p) => {
    p.repoNames[id] = name;
  });
  return json({ ok: true, repo: name, login: gh.login });
}
