// GET: the SECURITY.md generated from the pool's published rulebook.
import { securityMd } from "@/lib/securityMd";
import { loadPrivate, loadRules } from "@/lib/server/db";
import { ensureFresh } from "@/lib/server/indexer";
import { bad } from "@/lib/server/views";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = (await ensureFresh()).pools[id];
  const published = (await loadRules())[id]?.versions.at(-1);
  if (!pool || !published) return bad("This pool has no published rules yet", 404);
  const repoName = (await loadPrivate()).repoNames[id] ?? null;
  return new Response(securityMd(published.rules, { ...pool, repoName }, new URL(req.url).origin), {
    headers: { "content-type": "text/markdown; charset=utf-8", "cache-control": "no-store" },
  });
}
