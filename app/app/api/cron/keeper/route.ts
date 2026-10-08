// Scheduled refund run for hosted deployments: call hourly with `Authorization: Bearer $CRON_SECRET`.
// (Vercel Cron sends this header automatically when CRON_SECRET is set.) Refunds are open to anyone
// on-chain anyway; the secret only stops strangers from spending the relayer's gas.
import { isDeployed } from "@/lib/server/indexer";
import { runKeeper } from "@/lib/server/keeper";
import { bad, json } from "@/lib/server/views";

export const maxDuration = 60;

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return bad("CRON_SECRET is not set", 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return bad("Unauthorized", 401);
  if (!isDeployed) return bad("Contract not deployed on this network", 503);
  return json(await runKeeper());
}

export const GET = handle;
export const POST = handle;
