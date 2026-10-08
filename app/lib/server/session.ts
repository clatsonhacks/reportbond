import "server-only";
import { publicClient } from "../clients";
import { decodeToken, signInMessage, SIGN_IN_TTL_SECONDS } from "../auth";

/** Returns the signed-in wallet address (lowercase) from the Authorization header, or null. */
export async function signedInAddress(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const t = decodeToken(header.slice(7));
  if (!t) return null;

  const now = Math.floor(Date.now() / 1000);
  if (t.issuedAt > now + 60 || now - t.issuedAt > SIGN_IN_TTL_SECONDS) return null;
  if (t.host !== new URL(req.url).host) return null;

  // publicClient.verifyMessage also accepts smart-wallet (ERC-1271) signatures.
  const ok = await publicClient
    .verifyMessage({
      address: t.address as `0x${string}`,
      message: signInMessage(t.address, t.issuedAt, t.host),
      signature: t.signature,
    })
    .catch(() => false);
  return ok ? t.address.toLowerCase() : null;
}
