"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useSwitchChain } from "wagmi";
import { chain, config } from "@/lib/network";
import { formatUsdc } from "@/lib/format";
import { Button, Notice } from "./ui";

/**
 * Renders children only when a wallet is connected on the right network
 * (and, if `need` is given, holds at least that much USDC). Otherwise shows the one action that fixes it.
 */
export function WalletGate({ need, children }: { need?: bigint; children: React.ReactNode }) {
  const { address, chainId, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChain, isPending } = useSwitchChain();
  const balance = useBalance({ address, query: { enabled: Boolean(address) && need !== undefined } });

  if (!isConnected) {
    return (
      <Button onClick={openConnectModal} className="w-full sm:w-auto">
        Connect wallet
      </Button>
    );
  }
  if (chainId !== chain.id) {
    return (
      <div className="space-y-3">
        <Notice tone="waiting">Your wallet is on a different network. This pool is on {chain.name}.</Notice>
        <Button onClick={() => switchChain({ chainId: chain.id })} disabled={isPending}>
          {isPending ? "Switching…" : `Switch to ${chain.name}`}
        </Button>
      </div>
    );
  }
  if (need !== undefined && balance.data && balance.data.value < need) {
    return (
      <Notice tone="waiting">
        You need at least <span className="num">{formatUsdc(need)}</span> plus a little gas. Your wallet has{" "}
        <span className="num">{formatUsdc(balance.data.value)}</span>.{" "}
        {config.network === "testnet" && (
          <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="underline">
            Get test USDC from the faucet
          </a>
        )}
      </Notice>
    );
  }
  return <>{children}</>;
}
