import { config } from "@/lib/network";
import { ensureFresh, isDeployed } from "@/lib/server/indexer";
import { json } from "@/lib/server/views";
import type { StatusView } from "@/lib/types";

export async function GET() {
  const d = await ensureFresh();
  const body: StatusView = {
    network: config.network,
    chainId: config.chainId,
    deployed: isDeployed,
    contract: config.contractAddress,
    lastBlock: d.lastBlock,
  };
  return json(body);
}
