// GET /api/github/my-reports?pool=ID — the private reports the signed-in GitHub account filed on
// pools' repositories, with what each needs next. This is what the reporter pays a deposit for:
// a report has to exist on GitHub, filed by them, before payment is offered.
import { loadGithub, loadPrivate } from "@/lib/server/db";
import { syncAllAdvisories, syncPoolAdvisories } from "@/lib/server/advisorySync";
import { currentSession } from "@/lib/server/githubSession";
import { syncFresh } from "@/lib/server/indexer";
import { trackedView, verifiedRepoPools } from "@/lib/server/tracker";
import { bad, json } from "@/lib/server/views";

export async function GET(req: Request) {
  const session = await currentSession();
  if (!session) return bad("Sign in with GitHub to see your reports", 401);
  const poolId = new URL(req.url).searchParams.get("pool");

  // False when GitHub has no private reports to offer for this pool's repository.
  const available = poolId ? await syncPoolAdvisories(poolId, true) : (await syncAllAdvisories(), true);

  const [chain, gh, priv] = await Promise.all([syncFresh(), loadGithub(), loadPrivate()]);
  const poolOf = verifiedRepoPools(gh);
  const now = Math.floor(Date.now() / 1000);
  const reports = Object.values(gh.advisories)
    .filter((a) => a.reporter === session.login)
    .map((a) => ({ a, pool: poolOf.get(a.repo) }))
    .filter((x) => x.pool !== undefined && (!poolId || String(x.pool) === poolId))
    .sort((x, y) => y.a.reportedAt - x.a.reportedAt)
    .map(({ a, pool }) => {
      const v = trackedView(a, chain, now, gh);
      const p = chain.pools[String(pool)];
      return {
        ghsa: a.ghsa,
        title: a.title ?? null,
        url: a.url,
        repo: priv.repoNames[String(pool)] ?? a.repo,
        poolId: pool!,
        reportedAt: a.reportedAt,
        githubState: a.githubState,
        bond: v.bond,
        bondDeadline: v.bondDeadline,
        reportId: v.reportId,
        status: v.status,
        advisoryHash: a.advisoryHash,
        depositAmount: p?.depositAmount ?? "0",
      };
    });
  return json({ login: session.login, reports, available });
}
