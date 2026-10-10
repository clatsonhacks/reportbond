// GET /api/nano/balance?address=0x… — a wallet's Circle Gateway balance (what it can spend on
// filing fees without a transaction), and the contracts it tops that balance up through.
import { isAddress } from "viem";
import { filingFee, gatewayBalance, gatewayContracts } from "@/lib/server/nano";
import { bad, json } from "@/lib/server/views";

export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") ?? "";
  if (!isAddress(address)) return bad("address is required");
  if (!filingFee()) return bad("No filing fee is charged here", 404);
  try {
    const [balance, contracts] = await Promise.all([gatewayBalance(address), gatewayContracts()]);
    return json({ balance, ...contracts });
  } catch (e) {
    return bad(`Circle Gateway is unavailable: ${(e as Error).message}`, 502);
  }
}
