// Plain-language reasons for contract reverts and wallet errors (docs/DESIGN.md: "failed with a plain reason").
import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from "viem";

const reasons: Record<string, string> = {
  ZeroValue: "Some required values are empty or zero.",
  PoolNotFound: "This pool doesn't exist.",
  NotPoolCreator: "Only the pool creator can do this.",
  WrongDeposit: "The deposit must be exactly the pool's deposit amount.",
  ReportNotOpen: "This report already has a final outcome.",
  SignatureExpired: "The signature has expired. Please sign again.",
  InvalidSignature: "The signature isn't from this pool's verdict signer.",
  InvalidVerdict: "That isn't a valid verdict.",
  BountyTooHigh: "The bounty is above this pool's cap, or was added to a verdict other than Valid.",
  InsufficientPoolFunds: "The pool doesn't have enough money for this.",
  NotExpired: "The deadline hasn't passed yet.",
  NothingToWithdraw: "There's nothing to withdraw.",
  ReportsOpen: "Pool funds can only be withdrawn when no reports are open.",
  TransferFailed: "The transfer to your wallet failed.",
};

export function revertName(e: unknown): string | null {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? null;
  }
  return null;
}

export function explainError(e: unknown): string {
  if (e instanceof BaseError) {
    if (e.walk((err) => err instanceof UserRejectedRequestError)) return "You cancelled the request in your wallet.";
    const name = revertName(e);
    if (name && reasons[name]) return reasons[name];
    if (/insufficient funds/i.test(e.message)) return "Your wallet doesn't have enough USDC for this and the gas fee.";
    return e.shortMessage;
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
