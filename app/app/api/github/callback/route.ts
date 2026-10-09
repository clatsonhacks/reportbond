// GitHub sends the maintainer back here after installing the app or signing in.
import { adminRepos, exchangeCode } from "@/lib/server/github";
import { createSession, takeState } from "@/lib/server/githubSession";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (status: string) => Response.redirect(new URL(`/maintainer?github=${status}`, url.origin), 302);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = await takeState();
  // GitHub's install page omits state when the app is installed from GitHub itself; then we require a fresh sign-in.
  if (!code) return back("cancelled");
  if (!state || state !== expected) return back("expired");
  try {
    const { login, repos } = await adminRepos(await exchangeCode(code));
    await createSession(login, repos);
    return back(repos.length ? "connected" : "no-repos");
  } catch (e) {
    console.error("[github] sign-in failed:", e);
    return back("failed");
  }
}
