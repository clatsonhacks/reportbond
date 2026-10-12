import { ensureFresh } from "@/lib/server/indexer";
import { bad, json } from "@/lib/server/views";

// GET /api/withdrawals?account=0x…
export async function GET(req: Request) {
  const account = new URL(req.url).searchParams.get("account")?.toLowerCase();
  if (!account) return bad("account is required");
  const d = await ensureFresh();
  const withdrawals = (d.withdrawals[account] ?? []).slice().sort((a, b) => b.time - a.time);
  return json({ withdrawals });
}
