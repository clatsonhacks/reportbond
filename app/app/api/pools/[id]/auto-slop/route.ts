// POST /api/pools/:id/auto-slop { threshold } — the pool creator sets the confidence at which the AI
// rejects a report as slop on its own (50 to 100 percent), or turns that off with { threshold: null }.
import { setAutoSlop, validThreshold } from "@/lib/server/autoSlop";
import { syncFresh } from "@/lib/server/indexer";
import { requireCreator } from "@/lib/server/poolAuth";
import { bad, json } from "@/lib/server/views";
import { AUTO_SLOP_MIN } from "@/lib/delegate";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCreator(req, id);
  if (!auth.ok) return auth.response;
  const b = (await req.json().catch(() => ({}))) as { threshold?: unknown };
  const threshold = b.threshold === null ? null : validThreshold(b.threshold);
  if (b.threshold !== null && threshold === null) return bad(`The threshold must be a whole number from ${AUTO_SLOP_MIN} to 100`);
  const pool = (await syncFresh()).pools[id];
  if (!pool) return bad("Pool not found", 404);
  return json({ autoSlop: await setAutoSlop(id, pool.verdictSigner, threshold) });
}
