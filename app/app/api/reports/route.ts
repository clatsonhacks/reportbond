import { loadPrivate } from "@/lib/server/db";
import { ensureFresh } from "@/lib/server/indexer";
import { json, reportView } from "@/lib/server/views";

// GET /api/reports?pool=1&reporter=0x…&creator=0x…&open=1
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const pool = q.get("pool");
  const reporter = q.get("reporter")?.toLowerCase();
  const creator = q.get("creator")?.toLowerCase();
  const open = q.get("open") === "1";
  const d = await ensureFresh();
  const priv = await loadPrivate();
  const reports = Object.values(d.reports)
    .filter((r) => !pool || String(r.poolId) === pool)
    .filter((r) => !reporter || r.reporter === reporter)
    .filter((r) => !creator || d.pools[r.poolId]?.creator === creator)
    .filter((r) => !open || r.status === 1 || r.status === 2)
    .sort((a, b) => (open ? a.deadline - b.deadline : b.id - a.id))
    .map((r) => reportView(priv, r));
  return json({ reports });
}
