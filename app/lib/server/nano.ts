// The filing fee: a tiny, non-refundable payment a reporter makes before the deposit, collected
// through Circle Gateway nanopayments. Off unless FILING_FEE_USDC and FILING_FEE_RECIPIENT are set.
// The deposit is still the real bond; the fee only makes mass-filing cost something even when
// every deposit would come back.
import "server-only";
import "./env";
import { isAddress, parseUnits, type Address } from "viem";
import { config } from "../network";
import {
  BATCHING_NAME,
  BATCHING_VERSION,
  decodeHeader,
  encodeHeader,
  GATEWAY_USDC_DECIMALS,
  type FeeView,
  type PaymentPayload,
  type PaymentRequired,
  type PaymentRequirements,
} from "../nano";
import { loadPrivate, updatePrivate } from "./db";

const DEFAULT_API = { testnet: "https://gateway-api-testnet.circle.com", mainnet: "https://gateway-api.circle.com", local: "" };
// Circle's Gateway domain number for Arc (testnet and mainnet).
const GATEWAY_DOMAIN = Number(process.env.GATEWAY_DOMAIN ?? 26);
const NETWORK = `eip155:${config.chainId}`;

const apiUrl = () => (process.env.GATEWAY_API_URL ?? DEFAULT_API[config.network]).replace(/\/$/, "");

/** The fee in atomic USDC (6 decimals) and who receives it, or null when no fee is charged. */
export function filingFee(): { amount: string; payTo: Address } | null {
  const raw = process.env.FILING_FEE_USDC?.trim();
  const payTo = process.env.FILING_FEE_RECIPIENT?.trim();
  if (!raw || !payTo || !apiUrl()) return null;
  if (!isAddress(payTo)) throw new Error("FILING_FEE_RECIPIENT is not an address");
  const amount = parseUnits(raw, GATEWAY_USDC_DECIMALS);
  if (amount <= 0n) return null;
  return { amount: amount.toString(), payTo };
}

type SupportedKind = {
  network: string;
  extra?: { verifyingContract?: Address; assets?: { symbol: string; address: Address }[] };
};
const cache = globalThis as { __rbGatewayKind?: SupportedKind };

/** How Gateway takes payment on this app's chain: its wallet contract and USDC address. */
async function gatewayKind(): Promise<SupportedKind> {
  if (cache.__rbGatewayKind) return cache.__rbGatewayKind;
  const res = await fetch(`${apiUrl()}/v1/x402/supported`);
  if (!res.ok) throw new Error(`Circle Gateway is unavailable (${res.status})`);
  const { kinds } = (await res.json()) as { kinds: SupportedKind[] };
  const kind = kinds.find((k) => k.network === NETWORK && k.extra?.verifyingContract && k.extra.assets?.some((a) => a.symbol === "USDC"));
  if (!kind) throw new Error(`Circle Gateway doesn't support ${NETWORK}`);
  return (cache.__rbGatewayKind = kind);
}

async function requirements(fee: { amount: string; payTo: Address }): Promise<PaymentRequirements> {
  const kind = await gatewayKind();
  return {
    scheme: "exact",
    network: NETWORK,
    asset: kind.extra!.assets!.find((a) => a.symbol === "USDC")!.address,
    amount: fee.amount,
    payTo: fee.payTo,
    maxTimeoutSeconds: 7 * 24 * 60 * 60 + 100,
    extra: { name: BATCHING_NAME, version: BATCHING_VERSION, verifyingContract: kind.extra!.verifyingContract! },
  };
}

async function gateway<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiUrl()}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Circle Gateway answered ${res.status}: ${text.slice(0, 200)}`);
  }
}

export type FeeRecord = { payer: string; amount: string; transaction: string; at: number };

export async function paidFee(advisoryHash: string): Promise<FeeRecord | null> {
  return (await loadPrivate()).filingFees?.[advisoryHash] ?? null;
}

export function feeView(fee: { amount: string; payTo: Address }, record: FeeRecord | null): FeeView {
  return { amount: fee.amount, payTo: fee.payTo, paid: Boolean(record), transaction: record?.transaction };
}

/** The 402 answer: what to pay, in the PAYMENT-REQUIRED header and the body. */
export async function paymentRequiredResponse(req: Request, fee: { amount: string; payTo: Address }, reason?: string): Promise<Response> {
  const paymentRequired: PaymentRequired = {
    x402Version: 2,
    resource: { url: new URL(req.url).pathname, description: "ReportBond filing fee", mimeType: "application/json" },
    accepts: [await requirements(fee)],
  };
  return Response.json(
    { error: reason ?? "A filing fee is due before the deposit.", paymentRequired, fee: feeView(fee, null) },
    { status: 402, headers: { "PAYMENT-REQUIRED": encodeHeader(paymentRequired), "cache-control": "no-store" } },
  );
}

/**
 * Take the payment in the request's Payment-Signature header for this advisory. Gateway checks the
 * signature and the payer's balance, then queues the transfer for its next batch.
 */
export async function collectFee(
  header: string,
  fee: { amount: string; payTo: Address },
  advisoryHash: string,
): Promise<{ ok: true; record: FeeRecord } | { ok: false; reason: string }> {
  const payload = decodeHeader<PaymentPayload>(header);
  if (!payload?.payload?.authorization || !payload.payload.signature) return { ok: false, reason: "The payment header is malformed." };
  // Our own requirements, never the ones the client echoes back.
  const paymentRequirements = await requirements(fee);
  const body = { paymentPayload: payload, paymentRequirements };
  const verified = await gateway<{ isValid?: boolean; invalidReason?: string; payer?: string }>("/v1/x402/verify", body);
  if (!verified.isValid) return { ok: false, reason: explain(verified.invalidReason) };
  const settled = await gateway<{ success?: boolean; errorReason?: string; transaction?: string; payer?: string }>("/v1/x402/settle", body);
  if (!settled.success) return { ok: false, reason: explain(settled.errorReason) };
  const record: FeeRecord = {
    payer: (settled.payer ?? verified.payer ?? payload.payload.authorization.from).toLowerCase(),
    amount: fee.amount,
    transaction: settled.transaction ?? "",
    at: Math.floor(Date.now() / 1000),
  };
  await updatePrivate((d) => {
    (d.filingFees ??= {})[advisoryHash] = record;
  });
  return { ok: true, record };
}

function explain(reason?: string): string {
  if (!reason) return "Circle Gateway refused the payment.";
  if (/insufficient/i.test(reason)) return "Your Gateway balance is too low for the fee. Add funds and try again.";
  return `Circle Gateway refused the payment (${reason.replace(/_/g, " ")}).`;
}

/** A wallet's spendable Gateway balance on this chain, in atomic USDC. */
export async function gatewayBalance(address: string): Promise<string> {
  const data = await gateway<{ balances?: { balance: string }[]; message?: string }>("/v1/balances", {
    token: "USDC",
    sources: [{ depositor: address, domain: GATEWAY_DOMAIN }],
  });
  if (!data.balances?.length) throw new Error(data.message ?? "Circle Gateway returned no balance");
  return parseUnits(data.balances[0].balance, GATEWAY_USDC_DECIMALS).toString();
}

/** What a wallet needs to top up: the Gateway Wallet contract and the USDC token to deposit. */
export async function gatewayContracts(): Promise<{ wallet: Address; usdc: Address }> {
  const req = await requirements({ amount: "0", payTo: "0x0000000000000000000000000000000000000000" });
  return { wallet: req.extra.verifyingContract, usdc: req.asset };
}
