"use client";

import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { reportBond } from "@/lib/contract";
import { formatUsdc } from "@/lib/format";
import { useTx } from "@/lib/useTx";
import { TxStatus } from "./TxStatus";
import { Amount, Button, Card } from "./ui";

/** Shows the connected wallet's credited balance and a Withdraw button. Hidden when nothing is owed. */
export function WithdrawCard({ onWithdrawn }: { onWithdrawn?: () => void } = {}) {
  const { address } = useAccount();
  const credits = useReadContract({
    ...reportBond,
    functionName: "credits",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address), refetchInterval: 15_000 },
  });
  const { writeContractAsync } = useWriteContract();
  const tx = useTx();
  const owed = credits.data ?? 0n;

  if (!address || (owed === 0n && tx.state.stage !== "confirmed")) return null;

  async function withdraw() {
    const hash = await tx.run(() => writeContractAsync({ ...reportBond, functionName: "withdraw" }));
    if (hash) {
      credits.refetch();
      onWithdrawn?.();
    }
  }

  return (
    <Card className="space-y-3 border-returned/40">
      {owed > 0n ? (
        <>
          <p>
            You can withdraw <Amount value={owed} className="font-medium" />.
          </p>
          <Button onClick={withdraw} disabled={tx.busy}>
            Withdraw {formatUsdc(owed)}
          </Button>
        </>
      ) : (
        <p>Withdrawn to your wallet.</p>
      )}
      <TxStatus state={tx.state} />
    </Card>
  );
}
