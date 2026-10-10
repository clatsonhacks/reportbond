"use client";

// The filing fee step: a tiny payment through Circle Gateway. The wallet keeps a small balance with
// Gateway (one on-chain top-up), then each fee is only a signature: no gas, no transaction.
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { erc20Abi, parseUnits, type Address } from "viem";
import { useAccount, usePublicClient, useSignTypedData, useWriteContract } from "wagmi";
import { api } from "@/lib/api";
import { explainError } from "@/lib/errors";
import { authorizationTypedData, encodeHeader, gatewayWalletAbi, newAuthorization, type PaymentRequired } from "@/lib/nano";
import { useTx } from "@/lib/useTx";
import { TxStatus } from "./TxStatus";
import { Amount, Button, Notice } from "./ui";
import { WalletGate } from "./WalletGate";

type Balance = { balance: string; wallet: Address; usdc: Address };

// Gateway counts USDC in 6 decimals; the rest of the app uses the chain's 18.
const toNative = (atomic: string | bigint) => BigInt(atomic) * 10n ** 12n;
// Enough for twenty fees, and never less than one cent, so the top-up is a rare event.
const topUpFor = (fee: bigint) => (fee * 20n > parseUnits("0.01", 6) ? fee * 20n : parseUnits("0.01", 6));

export function FilingFee({
  due,
  error,
  busy,
  onPay,
  onCancel,
}: {
  due: PaymentRequired;
  error: string | null;
  busy: boolean;
  onPay: (paymentHeader: string) => void;
  onCancel: () => void;
}) {
  const accepted = due.accepts[0];
  const fee = BigInt(accepted.amount);
  const topUp = topUpFor(fee);
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { signTypedDataAsync } = useSignTypedData();
  const tx = useTx();
  const [signing, setSigning] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);
  const gateway = useQuery({
    queryKey: ["gateway-balance", address ?? null],
    queryFn: () => api<Balance>(`/api/nano/balance?address=${address}`),
    enabled: Boolean(address),
    // Gateway credits a deposit a few seconds after it confirms.
    refetchInterval: (q) => (q.state.data && BigInt(q.state.data.balance) < fee ? 3000 : false),
  });
  const balance = gateway.data ? BigInt(gateway.data.balance) : null;
  const funded = balance !== null && balance >= fee;

  async function addFunds() {
    if (!gateway.data || !address || !client) return;
    const { wallet, usdc } = gateway.data;
    const allowance = await client.readContract({ address: usdc, abi: erc20Abi, functionName: "allowance", args: [address, wallet] });
    if (allowance < topUp) {
      const approved = await tx.run(() => writeContractAsync({ address: usdc, abi: erc20Abi, functionName: "approve", args: [wallet, topUp] }));
      if (!approved) return;
    }
    await tx.run(() => writeContractAsync({ address: wallet, abi: gatewayWalletAbi, functionName: "deposit", args: [usdc, topUp] }));
    await gateway.refetch();
  }

  async function pay() {
    if (!address) return;
    setSigning(true);
    setSignError(null);
    try {
      const authorization = newAuthorization(address, accepted);
      const signature = await signTypedDataAsync(authorizationTypedData(authorization, accepted));
      onPay(encodeHeader({ x402Version: due.x402Version, payload: { authorization, signature }, resource: due.resource, accepted }));
    } catch (e) {
      setSignError(explainError(e));
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">
          Filing fee: <Amount value={toNative(fee)} />
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          A one-time fee for this report, separate from the deposit and not refunded. It&apos;s paid through Circle
          Gateway with a signature: no gas and no transaction.
        </p>
      </div>
      <WalletGate>
        {gateway.isLoading ? (
          <p className="text-sm text-ink-muted">Checking your Gateway balance…</p>
        ) : gateway.error ? (
          <Notice tone="slashed">{gateway.error.message}</Notice>
        ) : funded ? (
          <p className="text-sm text-ink-muted">
            Your Gateway balance: <Amount value={toNative(balance!)} />
          </p>
        ) : (
          <Notice tone="waiting">
            Your Gateway balance is <Amount value={toNative(balance ?? 0n)} />. Add <Amount value={toNative(topUp)} /> once
            (enough for {(topUp / fee).toString()} fees); after that each fee is only a signature.
          </Notice>
        )}
        {(error || signError) && <Notice tone="slashed">{signError ?? error}</Notice>}
        <div className="flex flex-wrap gap-3">
          {funded ? (
            <Button onClick={pay} disabled={busy || signing}>
              {signing ? "Waiting for your wallet…" : busy ? "Paying…" : "Pay the fee"}
            </Button>
          ) : (
            <Button onClick={addFunds} disabled={tx.busy || !gateway.data}>
              Add funds to Gateway
            </Button>
          )}
          <Button variant="secondary" onClick={onCancel} disabled={busy || signing || tx.busy}>
            Back
          </Button>
        </div>
        <TxStatus state={tx.state} />
      </WalletGate>
    </div>
  );
}
