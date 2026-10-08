// Typed-data definitions shared with contracts/src/ReportBond.sol.
// The type strings must match the contract's typehashes character for character:
//   Acknowledge(uint256 reportId,uint256 deadline)
//   Verdict(uint256 reportId,uint8 verdict,uint256 bounty,uint256 deadline)
// Change them only together with the contract.

import type { Address } from "viem";

export const EIP712_NAME = "ReportBond";
export const EIP712_VERSION = "1";

/** Matches `enum Status` in the contract. */
export const Status = {
  None: 0,
  Submitted: 1,
  Acknowledged: 2,
  Valid: 3,
  Mistake: 4,
  Slop: 5,
  Refunded: 6,
} as const;
export type Status = (typeof Status)[keyof typeof Status];

/** The values a signed verdict may carry. */
export const Verdict = {
  Valid: Status.Valid,
  Mistake: Status.Mistake,
  Slop: Status.Slop,
} as const;
export type Verdict = (typeof Verdict)[keyof typeof Verdict];

export const reportBondTypes = {
  Acknowledge: [
    { name: "reportId", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  Verdict: [
    { name: "reportId", type: "uint256" },
    { name: "verdict", type: "uint8" },
    { name: "bounty", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function reportBondDomain(chainId: number, verifyingContract: Address) {
  return {
    name: EIP712_NAME,
    version: EIP712_VERSION,
    chainId,
    verifyingContract,
  } as const;
}

/** Typed data for `signTypedData` (wagmi/viem) for a verdict. Amounts are 18-decimal bigints. */
export function verdictTypedData(args: {
  chainId: number;
  contract: Address;
  reportId: bigint;
  verdict: Verdict;
  bounty: bigint;
  deadline: bigint;
}) {
  if (args.verdict !== Verdict.Valid && args.bounty !== 0n) {
    throw new Error("Only a Valid verdict can carry a bounty");
  }
  return {
    domain: reportBondDomain(args.chainId, args.contract),
    types: reportBondTypes,
    primaryType: "Verdict",
    message: {
      reportId: args.reportId,
      verdict: args.verdict,
      bounty: args.bounty,
      deadline: args.deadline,
    },
  } as const;
}

export function acknowledgeTypedData(args: {
  chainId: number;
  contract: Address;
  reportId: bigint;
  deadline: bigint;
}) {
  return {
    domain: reportBondDomain(args.chainId, args.contract),
    types: reportBondTypes,
    primaryType: "Acknowledge",
    message: { reportId: args.reportId, deadline: args.deadline },
  } as const;
}
