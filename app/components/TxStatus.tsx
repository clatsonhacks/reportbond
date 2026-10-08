import type { TxState } from "@/lib/useTx";
import { ExplorerLink, Notice } from "./ui";

export function TxStatus({ state, waitingText = "Confirm in your wallet…" }: { state: TxState; waitingText?: string }) {
  if (state.stage === "idle") return null;
  return (
    <div aria-live="polite">
      {state.stage === "wallet" && <Notice tone="waiting">{waitingText}</Notice>}
      {state.stage === "pending" && (
        <Notice tone="waiting">
          Waiting for the network to confirm… <ExplorerLink hash={state.hash} />
        </Notice>
      )}
      {state.stage === "confirmed" && (
        <Notice tone="returned">
          Confirmed on Arc. <ExplorerLink hash={state.hash} />
        </Notice>
      )}
      {state.stage === "failed" && (
        <Notice tone="slashed">
          Failed: {state.reason} {state.hash && <ExplorerLink hash={state.hash} />}
        </Notice>
      )}
    </div>
  );
}
