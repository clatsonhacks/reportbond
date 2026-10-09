import { loadGithub, loadPrivate } from "@/lib/server/db";
import { ensureFresh, syncFresh } from "@/lib/server/indexer";
import { bad, json, poolView, reportView } from "@/lib/server/views";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let d = await ensureFresh();
  if (!d.reports[id]) d = await syncFresh(); // just submitted, maybe not indexed yet
  const r = d.reports[id];
  if (!r) return bad("Report not found", 404);
  const priv = await loadPrivate();
  const p = d.pools[r.poolId];
  return json({ report: reportView(priv, r), pool: p ? poolView(d, priv, p, await loadGithub()) : null });
}
