// GET /api/github/connect?mode=install|signin — sends the maintainer to GitHub.
// "install" installs the app on chosen repos (and signs in); "signin" is for an app that's already installed.
import { connectUrl, githubConfigured } from "@/lib/server/github";
import { hydrateGithubApp } from "@/lib/server/githubAppStore";
import { newToken, safeNext, setNext, setState } from "@/lib/server/githubSession";
import { bad } from "@/lib/server/views";

export async function GET(req: Request) {
  await hydrateGithubApp();
  if (!githubConfigured()) return bad("GitHub isn't configured on this server yet", 503);
  const params = new URL(req.url).searchParams;
  const mode = params.get("mode") === "signin" ? "signin" : "install";
  // Reporters sign in from the report flow and come back to it.
  await setNext(safeNext(params.get("next")));
  const state = newToken();
  await setState(state);
  return Response.redirect(connectUrl(state, mode), 302);
}
