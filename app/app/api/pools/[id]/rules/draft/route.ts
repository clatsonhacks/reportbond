// POST: the setup agent reads the repository and the maintainer's answers and writes a draft rulebook.
import { AiError } from "@/lib/server/ai";
import { draftRulebook, type SetupAnswers } from "@/lib/server/agents/setup";
import { loadGithub, updateRules } from "@/lib/server/db";
import { requireCreator } from "@/lib/server/poolAuth";
import { bad, json } from "@/lib/server/views";

export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCreator(req, id);
  if (!auth.ok) return auth.response;
  const verified = (await loadGithub()).verifiedPools[id];
  if (!verified) return bad("Verify this pool with GitHub first, so the agent can read the repository");

  const b = (await req.json().catch(() => ({}))) as Partial<SetupAnswers>;
  const clean = (s: unknown) => (typeof s === "string" ? s.slice(0, 4000) : "");
  const answers: SetupAnswers = {
    about: clean(b.about),
    focus: clean(b.focus),
    exclude: clean(b.exclude),
    payouts: clean(b.payouts),
  };

  try {
    const { rules, model, sources } = await draftRulebook(verified.installationId, verified.repo, answers);
    await updateRules((d) => {
      (d[id] ??= { draft: null, versions: [] }).draft = rules;
    });
    return json({ rules, model, sources });
  } catch (e) {
    if (e instanceof AiError) return bad(e.message, 502);
    console.error("[setup agent]", e);
    return bad("The agent could not read the repository or draft the rules. Please try again.", 502);
  }
}
