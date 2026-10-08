// Keeps the cache in step with the chain. Usage: pnpm indexer [--once]
import "./env";
import { config } from "../lib/network";
import { isDeployed, syncOnce } from "../lib/server/indexer";

const INTERVAL_MS = 15_000;

async function tick() {
  const d = await syncOnce();
  console.log(
    `[indexer] ${config.network} block ${d.lastBlock}: ${Object.keys(d.pools).length} pools, ${Object.keys(d.reports).length} reports`,
  );
}

async function main() {
  if (!isDeployed) throw new Error(`No contract address in config for ${config.network}`);
  await tick();
  if (process.argv.includes("--once")) process.exit(0);
  setInterval(() => tick().catch((e) => console.error("[indexer]", e)), INTERVAL_MS);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
