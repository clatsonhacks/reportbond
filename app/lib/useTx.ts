"use client";

// Every transaction state is visible: waiting for wallet → pending → confirmed → failed (docs/ARCHITECTURE.md).
import { useCallback, useState } from "react";
import type { Hex } from "viem";
import { usePublicClient } from "wagmi";
import { explainError } from "./errors";

export type TxState =
  | { stage: "idle" }
  | { stage: "wallet" }
  | { stage: "pending"; hash: Hex }
  | { stage: "confirmed"; hash: Hex }
  | { stage: "failed"; reason: string; hash?: Hex };

/** `send` asks the wallet (or the relayer) for a tx hash; we then wait for it to confirm. */
export function useTx() {
  const client = usePublicClient();
  const [state, setState] = useState<TxState>({ stage: "idle" });

  const run = useCallback(
    async (send: () => Promise<Hex>): Promise<Hex | null> => {
      setState({ stage: "wallet" });
      let hash: Hex | undefined;
      try {
        hash = await send();
        setState({ stage: "pending", hash });
        const receipt = await client!.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("The transaction was reverted.");
        setState({ stage: "confirmed", hash });
        return hash;
      } catch (e) {
        setState({ stage: "failed", reason: explainError(e), hash });
        return null;
      }
    },
    [client],
  );

  const reset = useCallback(() => setState({ stage: "idle" }), []);
  const busy = state.stage === "wallet" || state.stage === "pending";
  return { state, run, reset, busy };
}
