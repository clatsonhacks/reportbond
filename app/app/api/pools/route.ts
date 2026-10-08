import { loadPrivate } from "@/lib/server/db";
import { ensureFresh } from "@/lib/server/indexer";
import { json, poolView } from "@/lib/server/views";

// GET /api/pools?creator=0x…
export async function GET(req: Request) {
  const d = await ensureFresh();
  const priv = loadPrivate();
  const creator = new URL(req.url).searchParams.get("creator")?.toLowerCase();
  const pools = Object.values(d.pools)
    .filter((p) => !creator || p.creator === creator)
    .sort((a, b) => b.id - a.id)
    .map((p) => poolView(d, priv, p));
  return json({ pools });
}
