"use client";

import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { isAddress, parseEventLogs, type Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { GithubConnect, GithubSignInButton } from "@/components/GithubConnect";
import { PoolList } from "@/components/PoolList";
import { TxStatus } from "@/components/TxStatus";
import { Button, buttonStyles, Card, Notice } from "@/components/ui";
import { WalletGate } from "@/components/WalletGate";
import { post } from "@/lib/api";
import { repoIdOf } from "@/lib/advisory";
import { reportBond } from "@/lib/contract";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { connectHref, useGithubSession } from "@/lib/github";
import { config } from "@/lib/network";
import { useSignIn } from "@/lib/useSignIn";
import { useTx } from "@/lib/useTx";

const DEPOSIT_PRESETS = ["0.001", "0.01", "0.1", "1"];
const REPO_RE = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;

export default function Maintainer() {
  const { address } = useAccount();
  return (
    <div className="space-y-8 fade-in">
      <div>
        <h1 className="text-2xl font-semibold">Maintainer console</h1>
        <p className="mt-1 text-ink-muted">Open a pool for your repo, then review reports as they arrive.</p>
      </div>
      <Suspense>
        <GithubConnect />
      </Suspense>
      <WalletGate>
        <section className="space-y-3 slide-up">
          <h2 className="font-semibold">Your pools</h2>
          <PoolList creator={address?.toLowerCase()} />
        </section>
        <div className="slide-up">
          <CreatePool />
        </div>
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
  const signIn = useSignIn();
  const quick = config.isTestnet;
  const github = useGithubSession();
  const ghRepos = github.data?.connected ? github.data.repos : [];

  const [repo, setRepo] = useState("");
  const [manualRepo, setManualRepo] = useState(false);
  // Deposits are meant to be nano payments: enough to make mass-produced reports cost something.
  const [deposit, setDeposit] = useState("0.001");
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
      if (!repo.trim()) throw new Error("Choose a repository first: sign in with GitHub, or type one.");
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
    const name = repo.trim().toLowerCase();
    let verify = "";
    if (ghRepos.includes(name)) {
      // Link the pool to the repo through GitHub: proves this wallet's owner administers it.
      try {
        const token = await signIn();
        await post(`/api/pools/${poolId}/verify`, { repo: name }, { authorization: `Bearer ${token}` });
      } catch {
        verify = "&verify=failed";
      }
    } else {
      await post(`/api/pools/${poolId}/repo`, { repo: name }).catch(() => {});
    }
    router.push(`/maintainer/pool/${poolId}?created=1${verify}`);
  }

  const field = "w-full rounded-[8px] border border-line bg-surface px-3 py-2 text-sm";
  return (
    <Card>
      <h2 className="font-semibold">Open a pool</h2>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <span className="text-sm font-medium">GitHub repository</span>
          {manualRepo ? (
            <input className={`${field} num`} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repo" aria-label="GitHub repository" required />
          ) : ghRepos.length > 0 ? (
            <select className={`${field} num`} value={repo} onChange={(e) => setRepo(e.target.value)} aria-label="GitHub repository" required>
              <option value="" disabled>
                Choose a repository you administer
              </option>
              {ghRepos.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          ) : github.data?.connected ? (
            <div>
              <a className={buttonStyles.secondary} href={connectHref("install")}>
                Choose repositories on GitHub
              </a>
            </div>
          ) : (
            <div>
              <GithubSignInButton />
            </div>
          )}
          <span className="block text-xs text-ink-muted">
            {manualRepo
              ? "A typed repo shows as unverified: reporters can't tell that you maintain it."
              : ghRepos.length > 0
                ? "Verified through GitHub: reporters see who maintains this pool."
                : "Sign in to pick your repository from a list. Nothing to type or paste."}{" "}
            <button
              type="button"
              className="underline underline-offset-2"
              onClick={() => {
                setManualRepo(!manualRepo);
                setRepo("");
              }}
            >
              {manualRepo ? "Use GitHub instead" : "Type a repo instead"}
            </button>
          </span>
        </div>
        <label className="space-y-1">
          <span className="text-sm font-medium">Deposit (USDC)</span>
          <input className={`${field} num`} inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} required />
          <span className="flex flex-wrap gap-1.5" role="group" aria-label="Deposit presets">
            {DEPOSIT_PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setDeposit(v)}
                aria-pressed={deposit === v}
                className={`num state-change rounded-full border px-2.5 py-0.5 text-xs ${
                  deposit === v ? "border-accent bg-accent text-accent-ink" : "border-line bg-card text-ink-muted hover:border-accent"
                }`}
              >
                {v}
              </button>
            ))}
          </span>
          <span className="block text-xs text-ink-muted">Exact amount a reporter pays, refunded unless the report is slop.</span>
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
