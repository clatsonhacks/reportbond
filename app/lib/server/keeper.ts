// Refunds open reports whose deadline has passed. Only ever returns money to its owner.
// Safe to run twice: a report that's already refunded or decided is skipped.
import "server-only";
import { publicClient } from "../clients";
import { explainError, revertName } from "../errors";
import { txUrl } from "../network";
import { syncFresh } from "./indexer";
import { sendRefund } from "./relayer";

export type KeeperResult = { due: number; refunded: { reportId: number; tx: string }[]; skipped: number[]; failed: { reportId: number; reason: string }[] };

export async function runKeeper(log: (msg: string) => void = () => {}): Promise<KeeperResult> {
  const d = await syncFresh();
  const now = Number((await publicClient.getBlock()).timestamp);
  const due = Object.values(d.reports).filter((r) => (r.status === 1 || r.status === 2) && r.deadline <= now);
  const result: KeeperResult = { due: due.length, refunded: [], skipped: [], failed: [] };
  log(`${due.length} report(s) due for refund`);

  for (const r of due) {
    try {
      const hash = await sendRefund(BigInt(r.id));
      await publicClient.waitForTransactionReceipt({ hash });
      result.refunded.push({ reportId: r.id, tx: hash });
      log(`refunded #${r.id} ${txUrl(hash) ?? hash}`);
    } catch (e) {
      if (revertName(e) === "ReportNotOpen") {
        result.skipped.push(r.id);
        log(`#${r.id} already final, skipping`);
      } else {
        result.failed.push({ reportId: r.id, reason: explainError(e) });
        log(`#${r.id} failed: ${explainError(e)}`);
      }
    }
  }
  if (due.length) await syncFresh();
  return result;
}
