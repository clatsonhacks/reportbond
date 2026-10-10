// GET: the pool's published rulebook (public), plus the draft for the pool creator.
// PUT: the creator saves an edited draft.
import { RulebookSchema, rulebookProblems, type PoolRulesView } from "@/lib/rules";
import { aiConfigured } from "@/lib/server/ai";
import { loadRules, updateRules } from "@/lib/server/db";
import { ensureFresh } from "@/lib/server/indexer";
import { requireCreator } from "@/lib/server/poolAuth";
import { signedInAddress } from "@/lib/server/session";
import { bad, json } from "@/lib/server/views";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const entry = (await loadRules())[id];
  const view: PoolRulesView = { published: entry?.versions.at(-1) ?? null, aiConfigured: aiConfigured() };
  const wallet = await signedInAddress(req);
  if (wallet && (await ensureFresh()).pools[id]?.creator === wallet) view.draft = entry?.draft ?? null;
  return json(view);
}

export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const auth = await requireCreator(req, id);
  if (!auth.ok) return auth.response;
  const parsed = RulebookSchema.safeParse(((await req.json().catch(() => ({}))) as { rules?: unknown }).rules);
  if (!parsed.success) return bad("The rules are missing fields");
  const problems = rulebookProblems(parsed.data);
  await updateRules((d) => {
    (d[id] ??= { draft: null, versions: [] }).draft = parsed.data;
  });
  return json({ ok: true, problems });
}
