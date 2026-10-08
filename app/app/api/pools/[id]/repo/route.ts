// The contract stores only keccak256("owner/repo"). Anyone may tell us the name, and we accept it
// only if it hashes to the pool's repoId, so this can't be abused.
import { repoIdOf } from "@/lib/advisory";
import { updatePrivate } from "@/lib/server/db";
import { ensureFresh, syncFresh } from "@/lib/server/indexer";
import { bad, json } from "@/lib/server/views";

const REPO_RE = /^[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100}$/;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { repo } = (await req.json().catch(() => ({}))) as { repo?: string };
  const name = repo?.trim().toLowerCase();
  if (!name || !REPO_RE.test(name)) return bad("Use the form owner/repo");

  let d = await ensureFresh();
  if (!d.pools[id]) d = await syncFresh(); // just created, maybe not indexed yet
  if (!d.pools[id]) return bad("Pool not found", 404);
  if (repoIdOf(name) !== d.pools[id].repoId) return bad("That repo doesn't match this pool");

  await updatePrivate((priv) => {
    priv.repoNames[id] = name;
  });
  return json({ ok: true, repo: name });
}
