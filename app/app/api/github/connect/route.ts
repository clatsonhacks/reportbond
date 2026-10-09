// GET /api/github/connect?mode=install|signin — sends the maintainer to GitHub.
// "install" installs the app on chosen repos (and signs in); "signin" is for an app that's already installed.
import { connectUrl, githubConfigured } from "@/lib/server/github";
import { newToken, setState } from "@/lib/server/githubSession";
import { bad } from "@/lib/server/views";

export async function GET(req: Request) {
  if (!githubConfigured()) return bad("GitHub isn't configured on this server yet", 503);
  const mode = new URL(req.url).searchParams.get("mode") === "signin" ? "signin" : "install";
  const state = newToken();
  await setState(state);
  return Response.redirect(connectUrl(state, mode), 302);
}
