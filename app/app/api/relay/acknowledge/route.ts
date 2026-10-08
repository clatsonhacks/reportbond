import { isHex } from "viem";
import { explainError, revertName } from "@/lib/errors";
import { relayAcknowledge } from "@/lib/server/relayer";
import { json } from "@/lib/server/views";

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, string | number>;
  try {
    if (!isHex(b.signature)) throw new Error("Missing signature");
    const hash = await relayAcknowledge({
      reportId: BigInt(b.reportId),
      deadline: BigInt(b.deadline),
      signature: b.signature,
    });
    return json({ hash });
  } catch (e) {
    return json({ error: explainError(e), code: revertName(e) }, 422);
  }
}
