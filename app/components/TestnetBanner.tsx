import { config } from "@/lib/network";

export function TestnetBanner() {
  if (!config.isTestnet) return null;
  return (
    <div className="border-b border-line bg-surface px-4 py-2.5" role="status">
      <div className="mx-auto flex max-w-4xl items-center justify-center gap-3 text-xs font-medium text-ink-muted">
        <div className="flex h-1 w-1 rounded-full bg-ink-muted"></div>
        <span>
          {config.network === "local" ? "Local Development" : "Testnet Mode"}
        </span>
        {config.network === "testnet" && (
          <>
            <span className="text-ink-muted">·</span>
            <a
              href="https://faucet.circle.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-ink underline-offset-2 hover:underline"
            >
              Get test USDC
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </>
        )}
      </div>
    </div>
  );
}
