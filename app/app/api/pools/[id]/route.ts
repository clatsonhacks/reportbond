import { loadGithub, loadPrivate, loadRules } from "@/lib/server/db";
import { ensureFresh, syncFresh } from "@/lib/server/indexer";
import { bad, json, poolView, reportView } from "@/lib/server/views";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let d = await ensureFresh();
  if (!d.pools[id]) d = await syncFresh(); // just created, maybe not indexed yet
  const p = d.pools[id];
  if (!p) return bad("Pool not found", 404);
  const priv = await loadPrivate();
  const recent = Object.values(d.reports)
    .filter((r) => r.poolId === p.id && r.status >= 3)
    .sort((a, b) => b.id - a.id)
    .slice(0, 10)
    .map((r) => reportView(priv, r));
  return json({ pool: poolView(d, priv, p, await loadGithub(), await loadRules()), recent });
}
