import { isHex } from "viem";
import { explainError, revertName } from "@/lib/errors";
import { syncAdvisoryStates } from "@/lib/server/githubSync";
import { publicClient } from "@/lib/clients";
import { relayVerdict } from "@/lib/server/relayer";
import { json } from "@/lib/server/views";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, string | number>;
  try {
    if (!isHex(b.signature)) throw new Error("Missing signature");
    const hash = await relayVerdict({
      reportId: BigInt(b.reportId),
      verdict: Number(b.verdict),
      bounty: BigInt(b.bounty),
      deadline: BigInt(b.deadline),
      signature: b.signature,
    });
    // Best effort: once the verdict is on-chain, accept or close the advisory on GitHub.
    // The hourly cron retries anything that fails here.
    publicClient
      .waitForTransactionReceipt({ hash })
      .then(() => syncAdvisoryStates())
      .catch((e) => console.error("[github] advisory sync failed:", e));
    return json({ hash });
  } catch (e) {
    return json({ error: explainError(e), code: revertName(e) }, 422);
  }
}
