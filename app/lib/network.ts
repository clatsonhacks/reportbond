// Network selection: one config shape for every network (docs/NETWORKS.md).
// Server code reads NETWORK; browser code reads NEXT_PUBLIC_NETWORK (set from NETWORK in next.config.ts).
import { defineChain, type Address } from "viem";
import testnet from "../../config/testnet.json";
import mainnet from "../../config/mainnet.json";

export type NetworkConfig = {
  network: "testnet" | "mainnet" | "local";
  chainId: number;
  rpcUrl: string;
  rpcFallbackUrl: string;
  explorerUrl: string;
  contractAddress: Address;
  deployBlock: number;
  isTestnet: boolean;
  /** VerdictDelegateFactory, for pools that let the AI reject slop automatically. Absent: that option is off. */
  delegateFactory?: Address;
};

const local: NetworkConfig = {
  network: "local",
  chainId: 31337,
  rpcUrl: "http://127.0.0.1:8545",
  rpcFallbackUrl: "http://127.0.0.1:8545",
  explorerUrl: "",
  contractAddress: (process.env.NEXT_PUBLIC_LOCAL_CONTRACT ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3") as Address,
  deployBlock: 0,
  isTestnet: true,
  // Deploy.s.sol deploys the factory right after ReportBond when AUTO_SIGNER is set.
  delegateFactory: (process.env.NEXT_PUBLIC_LOCAL_DELEGATE_FACTORY || undefined) as Address | undefined,
};

const configs: Record<string, NetworkConfig> = {
  testnet: testnet as NetworkConfig,
  mainnet: mainnet as NetworkConfig,
  local,
};

const name = process.env.NEXT_PUBLIC_NETWORK ?? process.env.NETWORK ?? "testnet";
if (!configs[name]) throw new Error(`Unknown NETWORK "${name}" (expected testnet, mainnet or local)`);

export const config: NetworkConfig = configs[name];

/** Arc as a custom chain. Native USDC uses 18 decimals, so wallets show amounts correctly. */
export const chain = defineChain({
  id: config.chainId,
  name: config.network === "mainnet" ? "Arc" : config.network === "local" ? "Anvil (local)" : "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: [config.rpcUrl, config.rpcFallbackUrl] } },
  blockExplorers: config.explorerUrl ? { default: { name: "Arcscan", url: config.explorerUrl } } : undefined,
  testnet: config.isTestnet,
});

export function txUrl(hash: string): string | null {
  return config.explorerUrl ? `${config.explorerUrl}/tx/${hash}` : null;
}

export function addressUrl(address: string): string | null {
  return config.explorerUrl ? `${config.explorerUrl}/address/${address}` : null;
}
