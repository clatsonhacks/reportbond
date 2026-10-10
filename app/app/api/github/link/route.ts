// Links a wallet to a GitHub account, so maintainers can see that the person who paid a report's deposit
// is the person who filed it on GitHub.
//   POST   needs both proofs at once: a GitHub session (cookie) and a wallet sign-in (bearer token)
//   GET    the link for the signed-in wallet
//   DELETE removes it
import { loadGithub, updateGithub } from "@/lib/server/db";
import { currentSession } from "@/lib/server/githubSession";
import { signedInAddress } from "@/lib/server/session";
import { bad, json } from "@/lib/server/views";

export async function GET(req: Request) {
  const wallet = await signedInAddress(req);
  if (!wallet) return bad("Sign in with your wallet", 401);
  const link = (await loadGithub()).walletLinks?.[wallet];
  return json({ wallet, login: link?.login ?? null, linkedAt: link?.linkedAt ?? null });
}

export async function POST(req: Request) {
  const session = await currentSession();
  if (!session) return bad("Sign in with GitHub first", 401);
  const wallet = await signedInAddress(req);
  if (!wallet) return bad("Sign in with your wallet", 401);
  await updateGithub((d) => {
    (d.walletLinks ??= {})[wallet] = { login: session.login, linkedAt: Math.floor(Date.now() / 1000) };
  });
  return json({ ok: true, wallet, login: session.login });
}

export async function DELETE(req: Request) {
  const wallet = await signedInAddress(req);
  if (!wallet) return bad("Sign in with your wallet", 401);
  await updateGithub((d) => {
    if (d.walletLinks) delete d.walletLinks[wallet];
  });
  return json({ ok: true });
}
