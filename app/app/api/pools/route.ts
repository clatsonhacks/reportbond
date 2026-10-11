import { loadGithub, loadPrivate, loadRules } from "@/lib/server/db";
import { ensureFresh } from "@/lib/server/indexer";
import { json, poolView } from "@/lib/server/views";

// GET /api/pools?creator=0x…
export async function GET(req: Request) {
  const d = await ensureFresh();
  const priv = await loadPrivate();
  const gh = await loadGithub();
  const rules = await loadRules();
  const creator = new URL(req.url).searchParams.get("creator")?.toLowerCase();
  const pools = Object.values(d.pools)
    .filter((p) => !creator || p.creator === creator)
    .sort((a, b) => b.id - a.id)
    .map((p) => poolView(d, priv, p, gh, rules));
  return json({ pools });
}
