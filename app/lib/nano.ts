// Circle Gateway nanopayments (x402): the buyer keeps a small USDC balance in the Gateway Wallet
// contract and pays by signing a message. No gas and no transaction per payment; Gateway settles
// many payments on-chain in one batch. Shared by the browser and the server.
import type { Address, Hex } from "viem";

/** One way the seller accepts payment, as sent in the 402 response. */
export type PaymentRequirements = {
  scheme: "exact";
  network: string; // "eip155:<chainId>"
  asset: Address; // USDC
  amount: string; // atomic units, 6 decimals
  payTo: Address;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string; verifyingContract: Address };
};

export type PaymentRequired = {
  x402Version: number;
  resource: { url: string; description: string; mimeType: string };
  accepts: PaymentRequirements[];
};

export type Authorization = {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
};

export type PaymentPayload = {
  x402Version: number;
  payload: { authorization: Authorization; signature: Hex };
  resource: PaymentRequired["resource"];
  accepted: PaymentRequirements;
};

/** What the app tells the browser about a filing fee. */
export type FeeView = { amount: string; payTo: Address; paid: boolean; transaction?: string };

export const GATEWAY_USDC_DECIMALS = 6;
export const BATCHING_NAME = "GatewayWalletBatched";
export const BATCHING_VERSION = "1";
// Gateway only batches authorizations that stay valid for at least a week.
const VALIDITY_SECONDS = 7 * 24 * 60 * 60 + 100;

export const authorizationTypes = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export function newAuthorization(from: Address, req: PaymentRequirements): Authorization {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const now = Math.floor(Date.now() / 1000);
  return {
    from,
    to: req.payTo,
    value: req.amount,
    validAfter: String(now - 600),
    validBefore: String(now + Math.max(req.maxTimeoutSeconds, VALIDITY_SECONDS)),
    nonce: `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`,
  };
}

/** The EIP-712 message the wallet signs. The Gateway Wallet contract is the verifier, not USDC. */
export function authorizationTypedData(a: Authorization, req: PaymentRequirements) {
  return {
    domain: {
      name: req.extra.name,
      version: req.extra.version,
      chainId: Number(req.network.split(":")[1]),
      verifyingContract: req.extra.verifyingContract,
    },
    types: authorizationTypes,
    primaryType: "TransferWithAuthorization" as const,
    message: {
      from: a.from,
      to: a.to,
      value: BigInt(a.value),
      validAfter: BigInt(a.validAfter),
      validBefore: BigInt(a.validBefore),
      nonce: a.nonce,
    },
  };
}

const toBase64 = (s: string) => (typeof btoa === "function" ? btoa(s) : Buffer.from(s, "utf8").toString("base64"));
const fromBase64 = (s: string) => (typeof atob === "function" ? atob(s) : Buffer.from(s, "base64").toString("utf8"));

/** Headers carry JSON as base64 (the x402 convention). */
export const encodeHeader = (value: unknown) => toBase64(JSON.stringify(value));
export function decodeHeader<T>(header: string): T | null {
  try {
    return JSON.parse(fromBase64(header)) as T;
  } catch {
    return null;
  }
}

export const gatewayWalletAbi = [
  {
    name: "deposit",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
