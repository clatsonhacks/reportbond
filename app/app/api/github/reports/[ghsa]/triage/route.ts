// POST /api/github/reports/:ghsa/triage?pool=ID — run the triage and critic agents on one private report.
// Pool creator only. The result is a recommendation; nothing is signed or sent on-chain here.
import { aiConfigured } from "@/lib/server/ai";
import { runTriage } from "@/lib/server/agents/triage";
import { loadGithub, loadRules } from "@/lib/server/db";
import { requireCreator } from "@/lib/server/poolAuth";
import { bad, json } from "@/lib/server/views";

export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ ghsa: string }> }) {
  const ghsa = (await params).ghsa.toUpperCase();
  const poolId = new URL(req.url).searchParams.get("pool") ?? "";
  const auth = await requireCreator(req, poolId);
  if (!auth.ok) return auth.response;

  const gh = await loadGithub();
  const verified = gh.verifiedPools[poolId];
  if (!verified) return bad("Verify this pool with GitHub first");
  const advisory = gh.advisories[ghsa];
  if (!advisory || advisory.repo !== verified.repo) return bad("That report isn't on this pool's repository", 404);
  const rules = (await loadRules())[poolId]?.versions.at(-1);
  if (!rules) return bad("Publish the pool's rules first: the agents judge reports against them");
  if (!aiConfigured()) return bad("The AI isn't set up on this server", 503);

  const run = await runTriage(verified.installationId, verified.repo, ghsa, rules);
  return json({ run }, run.error ? 502 : 200);
}
