import { config } from "@/lib/network";

export function TestnetBanner() {
  if (!config.isTestnet) return null;
  return (
    <div className="bg-testnet-bg px-4 py-2 text-center text-sm font-medium text-testnet" role="status">
      {config.network === "local" ? "Local chain" : "Testnet"}: no real money.{" "}
      {config.network === "testnet" && (
        <a href="https://faucet.circle.com" target="_blank" rel="noreferrer" className="underline underline-offset-2">
          Get test USDC
        </a>
      )}
    </div>
  );
}
