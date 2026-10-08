// Refunds open reports whose deadline has passed. Usage: pnpm keeper [--once]
// When hosted, a scheduler can call /api/cron/keeper instead (see README).
import "./env";
import { config } from "../lib/network";
import { isDeployed } from "../lib/server/indexer";
import { runKeeper } from "../lib/server/keeper";

const INTERVAL_MS = Number(process.env.KEEPER_INTERVAL_MS ?? 60 * 60 * 1000);
const log = (msg: string) => console.log(`[keeper] ${config.network}: ${msg}`);

async function main() {
  if (!isDeployed) throw new Error(`No contract address in config for ${config.network}`);
  await runKeeper(log);
  if (process.argv.includes("--once")) process.exit(0);
  setInterval(() => runKeeper(log).catch((e) => console.error("[keeper]", e)), INTERVAL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
