// viem public client with automatic fallback to the backup RPC.
import { createPublicClient, fallback, http } from "viem";
import { chain, config } from "./network";

export const publicClient = createPublicClient({
  chain,
  transport: fallback([http(config.rpcUrl), http(config.rpcFallbackUrl)]),
  // viem caches eth_blockNumber for 4 s by default; the indexer needs the real latest block,
  // or a report filed a moment ago looks missing.
  cacheTime: 0,
});
