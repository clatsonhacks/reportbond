import { reportBondAbi } from "./abi";
import { config } from "./network";

export const reportBond = {
  address: config.contractAddress,
  abi: reportBondAbi,
} as const;

export { reportBondAbi };
