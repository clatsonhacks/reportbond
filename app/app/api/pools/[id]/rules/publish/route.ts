// POST: publish the draft as a new rulebook version. Reports are judged by the version in force when filed.
import { rulebookProblems } from "@/lib/rules";
import { newFileUrl, securityMd } from "@/lib/securityMd";
import { loadGithub, loadPrivate, loadRules, updateRules } from "@/lib/server/db";
import { requireCreator } from "@/lib/server/poolAuth";
import { repoInfo } from "@/lib/server/repo";
import { bad, json } from "@/lib/server/views";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireCreator(req, id);
  if (!auth.ok) return auth.response;
  const draft = (await loadRules())[id]?.draft;
  if (!draft) return bad("There is no draft to publish");
  const problems = rulebookProblems(draft);
  if (problems.length) return bad(problems.join(" "));

  let version = 0;
  await updateRules((d) => {
    const entry = (d[id] ??= { draft: null, versions: [] });
    version = (entry.versions.at(-1)?.version ?? 0) + 1;
    entry.versions.push({ version, publishedAt: Math.floor(Date.now() / 1000), rules: draft });
    entry.draft = null;
  });

  const repoName = (await loadPrivate()).repoNames[id] ?? null;
  const md = securityMd(draft, { ...auth.pool, repoName }, new URL(req.url).origin);
  // A link to GitHub's own editor with the file pre-filled: the maintainer commits it, so we need no write access.
  const verified = (await loadGithub()).verifiedPools[id];
  let commitUrl: string | null = null;
  if (verified) {
    const branch = await repoInfo(verified.installationId, verified.repo)
      .then((r) => r.defaultBranch)
      .catch(() => "main");
    commitUrl = newFileUrl(verified.repo, branch, md);
  }
  return json({ version, securityMd: md, commitUrl });
}
