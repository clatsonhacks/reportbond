// Refunds open reports whose deadline has passed. Only ever returns money to its owner.
// Safe to run twice: a report that's already refunded or decided is skipped.
// Usage: pnpm keeper [--once]
import "./env";
import { explainError, revertName } from "../lib/errors";
import { config, txUrl } from "../lib/network";
import { publicClient } from "../lib/clients";
import { isDeployed, syncOnce } from "../lib/server/indexer";
import { sendRefund } from "../lib/server/relayer";

const INTERVAL_MS = Number(process.env.KEEPER_INTERVAL_MS ?? 60 * 60 * 1000);

async function tick() {
  const d = await syncOnce();
  const now = Number((await publicClient.getBlock()).timestamp);
  const due = Object.values(d.reports).filter((r) => (r.status === 1 || r.status === 2) && r.deadline <= now);
  console.log(`[keeper] ${config.network}: ${due.length} report(s) due for refund`);

  for (const r of due) {
    try {
      const hash = await sendRefund(BigInt(r.id));
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[keeper] refunded #${r.id} ${txUrl(hash) ?? hash}`);
    } catch (e) {
      const name = revertName(e);
      if (name === "ReportNotOpen") console.log(`[keeper] #${r.id} already final, skipping`);
      else console.error(`[keeper] #${r.id} failed: ${explainError(e)}`);
    }
  }
  if (due.length) await syncOnce();
}

async function main() {
  if (!isDeployed) throw new Error(`No contract address in config for ${config.network}`);
  await tick();
  if (process.argv.includes("--once")) return;
  setInterval(() => tick().catch((e) => console.error("[keeper]", e)), INTERVAL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
