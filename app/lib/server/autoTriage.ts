// Every report that arrives with a deposit is reviewed by the agents without anyone asking.
// The deposit is what makes this affordable: reports nobody paid for are never read by the model.
import "server-only";
import { runTriage } from "./agents/triage";
import { syncPoolAdvisories } from "./advisorySync";
import { aiConfigured } from "./ai";
import { maybeAutoSlop } from "./autoSlop";
import { loadGithub, loadRules, loadTriage } from "./db";
import type { TriageRun } from "../rules";

// Reviews running in this process, so two requests about the same report don't both start one.
const running = ((globalThis as { __rbAutoTriage?: Set<string> }).__rbAutoTriage ??= new Set<string>());

/**
 * Review one report on a pool, unless it has been reviewed already or can't be: the pool isn't linked
 * to GitHub, has no published rules, or the site has no model. Never throws.
 */
export async function autoTriage(poolId: string, ghsa: string): Promise<TriageRun | null> {
  const id = ghsa.toUpperCase();
  if (!aiConfigured() || running.has(id)) return null;
  running.add(id);
  try {
    let gh = await loadGithub();
    const verified = gh.verifiedPools[poolId];
    if (!verified) return null;
    // A report filed moments ago may not be in the tracker yet: ask GitHub before giving up.
    if (!gh.advisories[id]) {
      await syncPoolAdvisories(poolId, true);
      gh = await loadGithub();
    }
    const advisory = gh.advisories[id];
    if (!advisory || advisory.repo !== verified.repo) return null;
    const rules = (await loadRules())[poolId]?.versions.at(-1);
    if (!rules) return null;
    if ((await loadTriage())[id]?.runs.length) return null;
    const run = await runTriage(verified.installationId, verified.repo, id, rules);
    return await maybeAutoSlop(poolId, id, run);
  } catch (e) {
    console.error(`[auto triage] ${id}:`, (e as Error).message);
    return null;
  } finally {
    running.delete(id);
  }
}
