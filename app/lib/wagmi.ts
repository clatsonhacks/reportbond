import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import { coinbaseWallet, injectedWallet, metaMaskWallet, rabbyWallet, walletConnectWallet } from "@rainbow-me/rainbowkit/wallets";
import { createConfig, fallback, http } from "wagmi";
import { chain, config } from "./network";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Wallets",
      // WalletConnect needs a project ID from cloud.reown.com; browser wallets work without one.
      wallets: projectId
        ? [metaMaskWallet, rabbyWallet, coinbaseWallet, walletConnectWallet, injectedWallet]
        : [injectedWallet, rabbyWallet, coinbaseWallet],
    },
  ],
  { appName: "ReportBond", projectId: projectId ?? "reportbond-local" },
);

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: { [chain.id]: fallback([http(config.rpcUrl), http(config.rpcFallbackUrl)]) },
  ssr: true,
});
