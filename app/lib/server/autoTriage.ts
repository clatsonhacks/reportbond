// Every report that arrives with a deposit is reviewed by the agents without anyone asking.
// The deposit is what makes this affordable: reports nobody paid for are never read by the model.
import "server-only";
import { runTriage } from "./agents/triage";
import { aiConfigured } from "./ai";
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
    const gh = await loadGithub();
    const verified = gh.verifiedPools[poolId];
    const advisory = gh.advisories[id];
    if (!verified || !advisory || advisory.repo !== verified.repo) return null;
    const rules = (await loadRules())[poolId]?.versions.at(-1);
    if (!rules) return null;
    if ((await loadTriage())[id]?.runs.length) return null;
    return await runTriage(verified.installationId, verified.repo, id, rules);
  } catch (e) {
    console.error(`[auto triage] ${id}:`, (e as Error).message);
    return null;
  } finally {
    running.delete(id);
  }
}
