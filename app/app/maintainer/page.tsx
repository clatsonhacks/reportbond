"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { isAddress, parseEventLogs, type Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { PoolList } from "@/components/PoolList";
import { TxStatus } from "@/components/TxStatus";
import { Button, Card, Notice } from "@/components/ui";
import { WalletGate } from "@/components/WalletGate";
import { post } from "@/lib/api";
import { repoIdOf } from "@/lib/advisory";
import { reportBond } from "@/lib/contract";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { config } from "@/lib/network";
import { useTx } from "@/lib/useTx";

const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

export default function Maintainer() {
  const { address } = useAccount();
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Maintainer console</h1>
        <p className="mt-1 text-ink-muted">Open a pool for your repo, then review reports as they arrive.</p>
      </div>
      <WalletGate>
        <section className="space-y-3">
          <h2 className="font-semibold">Your pools</h2>
          <PoolList creator={address?.toLowerCase()} />
        </section>
        <CreatePool />
      </WalletGate>
    </div>
  );
}

function CreatePool() {
  const router = useRouter();
  const { address } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const tx = useTx();
  const quick = config.isTestnet;

  const [repo, setRepo] = useState("");
  const [deposit, setDeposit] = useState(config.network === "mainnet" ? "0.50" : "5");
  const [timeoutValue, setTimeoutValue] = useState(quick ? "5" : "14");
  const [timeoutUnit, setTimeoutUnit] = useState<"minutes" | "days">(quick ? "minutes" : "days");
  const [maxPayout, setMaxPayout] = useState(config.network === "mainnet" ? "1" : "50");
  const [funding, setFunding] = useState(config.network === "mainnet" ? "2" : "10");
  const [signer, setSigner] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const verdictSigner = (signer.trim() || address) as Address;
    let values: { dep: bigint; max: bigint; fund: bigint; timeout: bigint };
    try {
      if (!REPO_RE.test(repo.trim())) throw new Error("Repo must look like owner/repo");
      if (!isAddress(verdictSigner)) throw new Error("Verdict signer isn't a valid address");
      const t = Number(timeoutValue);
      if (!Number.isFinite(t) || t <= 0) throw new Error("Timeout must be more than zero");
      values = {
        dep: parseUsdc(deposit),
        max: parseUsdc(maxPayout),
        fund: funding.trim() ? parseUsdc(funding) : 0n,
        timeout: BigInt(Math.round(t * (timeoutUnit === "days" ? 86400 : 60))),
      };
      if (values.dep === 0n || values.max === 0n) throw new Error("Deposit and payout cap must be more than zero");
    } catch (err) {
      setFormError((err as Error).message);
      return;
    }

    const hash = await tx.run(() =>
      writeContractAsync({
        ...reportBond,
        functionName: "createPool",
        args: [repoIdOf(repo), verdictSigner, values.dep, values.timeout, values.max],
        value: values.fund,
      }),
    );
    if (!hash || !client) return;
    const receipt = await client.getTransactionReceipt({ hash });
    const [ev] = parseEventLogs({ abi: reportBond.abi, eventName: "PoolCreated", logs: receipt.logs });
    const poolId = ev.args.poolId.toString();
    await post(`/api/pools/${poolId}/repo`, { repo: repo.trim() }).catch(() => {});
    router.push(`/maintainer/pool/${poolId}?created=1`);
  }

  const field = "w-full rounded-[8px] border border-line bg-surface px-3 py-2 text-sm";
  return (
    <Card>
      <h2 className="font-semibold">Open a pool</h2>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">GitHub repo</span>
          <input className={`${field} num`} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" required />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Deposit (USDC)</span>
          <input className={`${field} num`} inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} required />
          <span className="block text-xs text-ink-muted">Exact amount a reporter pays.</span>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Response time</span>
          <span className="flex gap-2">
            <input className={`${field} num`} inputMode="decimal" value={timeoutValue} onChange={(e) => setTimeoutValue(e.target.value)} required />
            <select className={field} value={timeoutUnit} onChange={(e) => setTimeoutUnit(e.target.value as "minutes" | "days")}>
              <option value="minutes">minutes</option>
              <option value="days">days</option>
            </select>
          </span>
          <span className="block text-xs text-ink-muted">After this, anyone can refund the deposit.</span>
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Bounty cap per report (USDC)</span>
          <input className={`${field} num`} inputMode="decimal" value={maxPayout} onChange={(e) => setMaxPayout(e.target.value)} required />
        </label>
        <label className="space-y-1">
          <span className="text-sm font-medium">Starting bounty funds (USDC)</span>
          <input className={`${field} num`} inputMode="decimal" value={funding} onChange={(e) => setFunding(e.target.value)} />
          <span className="block text-xs text-ink-muted">You can withdraw this whenever no reports are open.</span>
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="text-sm font-medium">Verdict signer</span>
          <input className={`${field} num`} value={signer} onChange={(e) => setSigner(e.target.value)} placeholder={address ?? "0x…"} />
          <span className="block text-xs text-ink-muted">
            The wallet that signs verdicts. Leave empty to use this wallet. It can&apos;t be changed later.
          </span>
        </label>
        <div className="space-y-3 sm:col-span-2">
          {formError && <Notice tone="slashed">{formError}</Notice>}
          <Button type="submit" disabled={tx.busy}>
            Create pool{funding.trim() && Number(funding) > 0 ? ` and deposit ${safeFormat(funding)}` : ""}
          </Button>
          <TxStatus state={tx.state} />
        </div>
      </form>
    </Card>
  );
}

function safeFormat(v: string) {
  try {
    return formatUsdc(parseUsdc(v));
  } catch {
    return v;
  }
}
