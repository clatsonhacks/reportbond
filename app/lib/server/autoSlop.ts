// Automatic rejection of clear slop. A pool's creator sets a threshold (default 90%, never below
// 50%); when both AI reviewers agree a report is slop with at least that confidence, the server signs
// a Slop verdict itself. It can do that only on pools whose verdict signer is a VerdictDelegate, and
// the delegate accepts nothing from this key except Slop: it can never pay a bounty.
import "server-only";
import { getAddress, type Address } from "viem";
import { publicClient } from "../clients";
import { AUTO_SLOP_MIN, delegateAbi, type AutoSlopView } from "../delegate";
import { Status } from "../eip712";
import { slopScore, type TriageRun } from "../rules";
import { loadGithub, loadPrivate, updatePrivate, updateTriage } from "./db";
import { syncAdvisoryStates } from "./githubSync";
import { syncFresh } from "./indexer";
import { relayAutoSlop, relayerAddress } from "./relayer";

export function validThreshold(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= AUTO_SLOP_MIN && n <= 100 ? n : null;
}

/**
 * Who a contract verdict signer answers to, read from the chain: null unless it is a VerdictDelegate
 * that takes automatic verdicts from this server's key.
 */
export async function delegateOwner(signer: string): Promise<Address | null> {
  const address = getAddress(signer);
  try {
    const [owner, auto] = await Promise.all([
      publicClient.readContract({ address, abi: delegateAbi, functionName: "owner" }),
      publicClient.readContract({ address, abi: delegateAbi, functionName: "autoSigner" }),
    ]);
    return auto.toLowerCase() === relayerAddress().toLowerCase() ? owner : null;
  } catch {
    return null; // a plain wallet, or some other contract
  }
}

/** Set (or with null, turn off) a pool's threshold, and note who its delegate answers to. */
export async function setAutoSlop(poolId: string, signer: string, threshold: number | null): Promise<AutoSlopView | null> {
  const owner = await delegateOwner(signer);
  await updatePrivate((d) => {
    const settings = (d.autoSlop ??= {});
    if (threshold === null) delete settings[poolId];
    else settings[poolId] = { threshold };
    if (owner) (d.delegates ??= {})[signer.toLowerCase()] = owner.toLowerCase();
  });
  return threshold === null ? null : { threshold, active: Boolean(owner) };
}

/**
 * After a review: reject the report on-chain if the pool asked for that and the reviewers are sure
 * enough. Returns the run, updated when a verdict was sent. Never throws.
 */
export async function maybeAutoSlop(poolId: string, ghsa: string, run: TriageRun): Promise<TriageRun> {
  try {
    const priv = await loadPrivate();
    const setting = priv.autoSlop?.[poolId];
    const rec = run.recommendation;
    if (!setting || !rec || run.error || run.autoVerdict) return run;
    // Both reviewers have to land on slop, and a report that tried to steer them is left to a person.
    if (rec.verdict !== "slop" || !run.critic?.agrees || run.triage?.injectionSuspected || run.critic.injectionSuspected) return run;
    const score = Math.round(slopScore(run)! * 100);
    if (score < setting.threshold) return run;

    const chain = await syncFresh();
    const pool = chain.pools[poolId];
    const advisory = (await loadGithub()).advisories[ghsa.toUpperCase()];
    if (!pool || !advisory) return run;
    const report = Object.values(chain.reports)
      .filter((r) => String(r.poolId) === poolId && r.advisoryHash === advisory.advisoryHash)
      .sort((a, b) => b.id - a.id)[0];
    if (!report || (report.status !== Status.Submitted && report.status !== Status.Acknowledged)) return run;
    if (!(await delegateOwner(pool.verdictSigner))) return run; // flagged only: this pool's signer is a plain wallet

    const tx = await relayAutoSlop(BigInt(report.id));
    const autoVerdict = { verdict: "slop" as const, score, threshold: setting.threshold, tx, at: Math.floor(Date.now() / 1000) };
    await updateTriage((d) => {
      const saved = d[ghsa.toUpperCase()]?.runs.find((r) => r.id === run.id);
      if (saved) saved.autoVerdict = autoVerdict;
    });
    // Best effort: close the advisory on GitHub once the verdict is on-chain (the cron retries).
    publicClient
      .waitForTransactionReceipt({ hash: tx })
      .then(() => syncAdvisoryStates())
      .catch((e) => console.error("[auto slop] advisory sync failed:", e));
    return { ...run, autoVerdict };
  } catch (e) {
    console.error(`[auto slop] ${ghsa}:`, (e as Error).message);
    return run;
  }
}
