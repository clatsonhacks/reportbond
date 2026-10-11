// Delivers signed messages to the contract and pays the gas. It can't create or change a verdict:
// the contract checks the verdict signer's signature. The one exception is opt-in: on a pool whose
// verdict signer is a VerdictDelegate, this key may sign a Slop verdict (see autoSlop.ts).
import "server-only";
import "./env";
import { createWalletClient, fallback, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../clients";
import { reportBond } from "../contract";
import { encodeAutoSlopSignature } from "../delegate";
import { Verdict, verdictTypedData } from "../eip712";
import { chain, config } from "../network";

function relayer() {
  // A local .env holds testnet keys; mainnet runs from a dev machine use MAINNET_RELAYER_PRIVATE_KEY.
  // A hosted deployment has one network per environment and just sets RELAYER_PRIVATE_KEY.
  const key = ((config.network === "mainnet" && process.env.MAINNET_RELAYER_PRIVATE_KEY) ||
    process.env.RELAYER_PRIVATE_KEY) as Hex | undefined;
  if (!key) throw new Error("RELAYER_PRIVATE_KEY is not set");
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({
    account,
    chain,
    transport: fallback([http(config.rpcUrl), http(config.rpcFallbackUrl)]),
  });
  return { account, wallet };
}

export const relayerAddress = () => relayer().account.address;

/**
 * Sign and send a Slop verdict as the automatic reviewer. Only a pool whose verdict signer is a
 * VerdictDelegate naming this key accepts it, and the delegate accepts Slop and nothing else.
 */
export async function relayAutoSlop(reportId: bigint): Promise<Hex> {
  const { account } = relayer();
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const signature = await account.signTypedData(
    verdictTypedData({ chainId: chain.id, contract: reportBond.address, reportId, verdict: Verdict.Slop, bounty: 0n, deadline }),
  );
  return relayVerdict({ reportId, verdict: Verdict.Slop, bounty: 0n, deadline, signature: encodeAutoSlopSignature(reportId, deadline, signature) });
}

export type VerdictInput = { reportId: bigint; verdict: number; bounty: bigint; deadline: bigint; signature: Hex };
export type AcknowledgeInput = { reportId: bigint; deadline: bigint; signature: Hex };

/** Simulate first so bad signatures fail here instead of costing gas. Throws viem errors on revert. */
export async function relayVerdict(v: VerdictInput): Promise<Hex> {
  const { account, wallet } = relayer();
  const { request } = await publicClient.simulateContract({
    ...reportBond,
    account,
    functionName: "submitVerdict",
    args: [v.reportId, v.verdict, v.bounty, v.deadline, v.signature],
  });
  return wallet.writeContract(request);
}

export async function relayAcknowledge(v: AcknowledgeInput): Promise<Hex> {
  const { account, wallet } = relayer();
  const { request } = await publicClient.simulateContract({
    ...reportBond,
    account,
    functionName: "acknowledge",
    args: [v.reportId, v.deadline, v.signature],
  });
  return wallet.writeContract(request);
}

export async function sendRefund(reportId: bigint): Promise<Hex> {
  const { account, wallet } = relayer();
  const { request } = await publicClient.simulateContract({
    ...reportBond,
    account,
    functionName: "refundExpired",
    args: [reportId],
  });
  return wallet.writeContract(request);
}
