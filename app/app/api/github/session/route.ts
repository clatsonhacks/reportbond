import { githubConfigured } from "@/lib/server/github";
import { currentSession } from "@/lib/server/githubSession";
import { json } from "@/lib/server/views";

export async function GET() {
  const s = await currentSession();
  return json({
    configured: githubConfigured(),
    connected: Boolean(s),
    login: s?.login ?? null,
    repos: s?.repos.map((r) => r.fullName) ?? [],
  });
}
