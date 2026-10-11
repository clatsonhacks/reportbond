// Pulls a repository's private vulnerability reports from GitHub into the tracker.
// Webhooks do this as reports arrive; this does it on demand, so the tracker also works where GitHub
// can't reach us (local development) and catches anything a webhook missed.
import "server-only";
import { loadGithub, updateGithub } from "./db";
import { GithubError, githubConfigured } from "./github";
import { hydrateGithubApp } from "./githubAppStore";
import { listAdvisories } from "./repo";
import { trackedFromWebhook } from "./tracker";

const MIN_INTERVAL_MS = 20_000;
const lastSync = ((globalThis as { __rbAdvisorySync?: Map<string, number> }).__rbAdvisorySync ??= new Map<string, number>());

// Repositories where GitHub has no private reports to list (private repos, or reporting turned off).
const unavailable = ((globalThis as { __rbAdvisoryUnavailable?: Set<string> }).__rbAdvisoryUnavailable ??= new Set<string>());

/**
 * Refresh one verified pool's reports from GitHub. Returns false when GitHub doesn't offer private
 * vulnerability reports for the repository: it is private, or the feature is off.
 */
export async function syncPoolAdvisories(poolId: string, force = false): Promise<boolean> {
  await hydrateGithubApp();
  if (!githubConfigured()) return true;
  const verified = (await loadGithub()).verifiedPools[poolId];
  if (!verified) return true;
  const last = lastSync.get(verified.repo) ?? 0;
  if (!force && Date.now() - last < MIN_INTERVAL_MS) return !unavailable.has(verified.repo);
  lastSync.set(verified.repo, Date.now());

  let list;
  try {
    list = await listAdvisories(verified.installationId, verified.repo);
    unavailable.delete(verified.repo);
  } catch (e) {
    // 404 here means the repository has no security advisories feature: GitHub only offers private
    // vulnerability reporting on public repositories.
    if (e instanceof GithubError && e.status === 404) {
      unavailable.add(verified.repo);
      return false;
    }
    console.error(`[github] couldn't list advisories for ${verified.repo}:`, (e as Error).message);
    return true;
  }
  await updateGithub((d) => {
    for (const a of list) {
      const t = trackedFromWebhook(a, verified.repo, null);
      if (!t) continue;
      const prev = d.advisories[t.ghsa];
      // Keep what we learned earlier (first-seen time, what was synced back); refresh GitHub's own fields.
      d.advisories[t.ghsa] = prev
        ? { ...prev, githubState: t.githubState, title: a.summary ?? prev.title, reporter: prev.reporter ?? t.reporter, updatedAt: t.updatedAt }
        : { ...t, title: a.summary };
    }
  });
  return true;
}

/** Refresh every verified pool (used when a reporter asks for all their reports). */
export async function syncAllAdvisories(): Promise<void> {
  const pools = Object.keys((await loadGithub()).verifiedPools);
  await Promise.all(pools.map((id) => syncPoolAdvisories(id)));
}
