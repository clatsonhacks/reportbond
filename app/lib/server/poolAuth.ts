// Shared check for maintainer-only routes: the caller's wallet sign-in must be the pool's creator.
import "server-only";
import type { ChainData, PoolRow } from "./db";
import { ensureFresh, syncFresh } from "./indexer";
import { signedInAddress } from "./session";
import { bad } from "./views";

export async function requireCreator(
  req: Request,
  id: string,
): Promise<{ ok: true; pool: PoolRow; chain: ChainData; wallet: string } | { ok: false; response: Response }> {
  const wallet = await signedInAddress(req);
  if (!wallet) return { ok: false, response: bad("Sign in with the wallet that created this pool", 401) };
  let chain = await ensureFresh();
  if (!chain.pools[id]) chain = await syncFresh();
  const pool = chain.pools[id];
  if (!pool) return { ok: false, response: bad("Pool not found", 404) };
  if (pool.creator !== wallet) return { ok: false, response: bad("Only the pool creator can do this", 403) };
  return { ok: true, pool, chain, wallet };
}
