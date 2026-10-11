// Writes verdicts back to GitHub: Valid accepts the advisory (draft), Mistake and Slop close it.
// Safe to run any number of times; each verdict is synced once, failures are recorded and retried.
import "server-only";
import { hydrateGithubApp } from "./githubAppStore";
import { loadGithub, updateGithub } from "./db";
import { setAdvisoryState, githubConfigured } from "./github";
import { syncFresh } from "./indexer";

const STATE_FOR: Record<number, "draft" | "closed"> = { 3: "draft", 4: "closed", 5: "closed" };

export type SyncResult = { synced: string[]; failed: { ghsa: string; error: string }[] };

export async function syncAdvisoryStates(): Promise<SyncResult> {
  const result: SyncResult = { synced: [], failed: [] };
  await hydrateGithubApp();
  if (!githubConfigured()) return result;
  const [chain, gh] = await Promise.all([syncFresh(), loadGithub()]);
  const installationFor = new Map(Object.values(gh.verifiedPools).map((v) => [v.repo, v.installationId]));

  for (const a of Object.values(gh.advisories)) {
    const installationId = installationFor.get(a.repo);
    if (!installationId) continue; // only repos with a verified pool
    const report = Object.values(chain.reports)
      .filter((r) => r.advisoryHash === a.advisoryHash)
      .sort((x, y) => y.id - x.id)[0];
    const state = report && STATE_FOR[report.status];
    if (!state || a.syncedStatus === report.status) continue;
    try {
      await setAdvisoryState(installationId, a.repo, a.ghsa, state);
      await updateGithub((d) => {
        const t = d.advisories[a.ghsa];
        if (t) Object.assign(t, { syncedStatus: report.status, githubState: state, syncError: undefined });
      });
      result.synced.push(a.ghsa);
    } catch (e) {
      const error = (e as Error).message;
      await updateGithub((d) => {
        const t = d.advisories[a.ghsa];
        if (t) t.syncError = error;
      });
      result.failed.push({ ghsa: a.ghsa, error });
    }
  }
  return result;
}
