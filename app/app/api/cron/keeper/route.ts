// Scheduled refund run for hosted deployments: call hourly with `Authorization: Bearer $CRON_SECRET`.
// (Vercel Cron sends this header automatically when CRON_SECRET is set.) Refunds are open to anyone
// on-chain anyway; the secret only stops strangers from spending the relayer's gas.
import { isDeployed } from "@/lib/server/indexer";
import { syncAdvisoryStates } from "@/lib/server/githubSync";
import { runKeeper } from "@/lib/server/keeper";
import { bad, json } from "@/lib/server/views";

export const maxDuration = 60;

async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return bad("CRON_SECRET is not set", 503);
  if (req.headers.get("authorization") !== `Bearer ${secret}`) return bad("Unauthorized", 401);
  if (!isDeployed) return bad("Contract not deployed on this network", 503);
  const refunds = await runKeeper();
  // Also retry writing verdicts back to GitHub, in case an earlier attempt failed.
  const github = await syncAdvisoryStates();
  return json({ ...refunds, github });
}

export const GET = handle;
export const POST = handle;
