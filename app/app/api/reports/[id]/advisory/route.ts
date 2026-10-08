// Advisory links are private: putting them on-chain would announce an unfixed vulnerability.
// POST stores a link (accepted only if it hashes to the report's on-chain advisoryHash).
// GET returns it only to the reporter or the pool creator, after wallet sign-in.
import { advisoryHashOf, parseAdvisoryUrl } from "@/lib/advisory";
import { loadPrivate, updatePrivate } from "@/lib/server/db";
import { ensureFresh, syncFresh } from "@/lib/server/indexer";
import { signedInAddress } from "@/lib/server/session";
import { bad, json } from "@/lib/server/views";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  const parsed = url ? parseAdvisoryUrl(url) : null;
  if (!parsed) return bad("Not a GitHub advisory link");

  let d = await ensureFresh();
  if (!d.reports[id]) d = await syncFresh(); // the report may be in a block we haven't read yet
  const r = d.reports[id];
  if (!r) return bad("Report not found", 404);
  if (advisoryHashOf(parsed.url) !== r.advisoryHash) return bad("This link doesn't match the report");

  updatePrivate((priv) => {
    priv.advisoryLinks[id] = parsed.url;
  });
  return json({ ok: true });
}

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const who = await signedInAddress(req);
  if (!who) return bad("Sign in with your wallet to see the advisory link", 401);
  const d = await ensureFresh();
  const r = d.reports[id];
  if (!r) return bad("Report not found", 404);
  const creator = d.pools[r.poolId]?.creator;
  if (who !== r.reporter && who !== creator) {
    return bad("Only the reporter and the pool creator can see this link", 403);
  }
  const url = loadPrivate().advisoryLinks[id];
  if (!url) return bad("No link stored for this report", 404);
  return json({ url });
}
