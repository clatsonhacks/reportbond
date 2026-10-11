// The verdict delegate (contracts/src/VerdictDelegate.sol): a pool's verdict signer that lets the
// maintainer sign anything and the automatic reviewer sign Slop only. One per maintainer, made by the factory.
import { encodeAbiParameters, type Address, type Hex } from "viem";
import { config } from "./network";

export const delegateFactory = config.delegateFactory
  ? ({
      address: config.delegateFactory,
      abi: [
        { type: "function", name: "delegateOf", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "address" }] },
        { type: "function", name: "create", stateMutability: "nonpayable", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "address" }] },
        { type: "function", name: "autoSigner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
      ],
    } as const)
  : null;

export const delegateAbi = [
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "autoSigner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "bond", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

/** The signature format the delegate accepts from the automatic reviewer. */
export function encodeAutoSlopSignature(reportId: bigint, deadline: bigint, signature: Hex): Hex {
  return encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }, { type: "bytes" }], [reportId, deadline, signature]);
}

export const AUTO_SLOP_MIN = 50;
export const AUTO_SLOP_DEFAULT = 90;

export type AutoSlopView = {
  /** Reject automatically when the AI is at least this sure a report is slop, in percent. */
  threshold: number;
  /** False when the pool's verdict signer can't act for the reviewer: reports are flagged, not rejected. */
  active: boolean;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
