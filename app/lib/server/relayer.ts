// Delivers signed messages to the contract and pays the gas. It can't create or change a verdict:
// the contract checks the verdict signer's signature, so this wallet only needs gas money.
import "server-only";
import "./env";
import { createWalletClient, fallback, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { publicClient } from "../clients";
import { reportBond } from "../contract";
import { chain, config } from "../network";

function relayer() {
  const key = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!key) throw new Error("RELAYER_PRIVATE_KEY is not set");
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({
    account,
    chain,
    transport: fallback([http(config.rpcUrl), http(config.rpcFallbackUrl)]),
  });
  return { account, wallet };
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
