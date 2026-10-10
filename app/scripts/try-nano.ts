// Pay one filing fee through Circle Gateway on Arc Testnet, with the test reporter wallet.
//   pnpm try:nano
// Tops up the wallet's Gateway balance if it is low (one approve and one deposit, both on-chain),
// then pays the fee with a signature only. Nothing is stored in the app's data.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWalletClient, erc20Abi, formatUnits, http, parseUnits, publicActions, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "rb-nano-"));
process.env.DATABASE_URL = "";

async function main() {
  await import("../jobs/env");
  process.env.FILING_FEE_USDC ??= "0.001";
  process.env.FILING_FEE_RECIPIENT ??= process.env.RELAYER_ADDRESS;
  const { chain, config } = await import("../lib/network");
  const { authorizationTypedData, encodeHeader, gatewayWalletAbi, newAuthorization } = await import("../lib/nano");
  const nano = await import("../lib/server/nano");
  if (config.network !== "testnet") throw new Error("try:nano only runs on testnet");

  const fee = nano.filingFee();
  if (!fee) throw new Error("Set FILING_FEE_RECIPIENT (or RELAYER_ADDRESS)");
  const account = privateKeyToAccount(process.env.TEST_REPORTER_PRIVATE_KEY as Hex);
  const wallet = createWalletClient({ account, chain, transport: http(config.rpcFallbackUrl) }).extend(publicActions);
  const usd = (v: string | bigint) => `${formatUnits(BigInt(v), 6)} USDC`;
  console.log(`Payer ${account.address}\nFee ${usd(fee.amount)} to ${fee.payTo}`);

  const { wallet: gatewayWallet, usdc } = await nano.gatewayContracts();
  let balance = BigInt(await nano.gatewayBalance(account.address));
  console.log(`Gateway balance: ${usd(balance)}`);
  if (balance < BigInt(fee.amount)) {
    const topUp = parseUnits(process.env.NANO_TOP_UP ?? "0.05", 6);
    console.log(`Topping up ${usd(topUp)}…`);
    const approve = await wallet.writeContract({ address: usdc, abi: erc20Abi, functionName: "approve", args: [gatewayWallet, topUp] });
    await wallet.waitForTransactionReceipt({ hash: approve });
    const deposit = await wallet.writeContract({ address: gatewayWallet, abi: gatewayWalletAbi, functionName: "deposit", args: [usdc, topUp] });
    const receipt = await wallet.waitForTransactionReceipt({ hash: deposit });
    console.log(`  deposit ${receipt.status}: ${config.explorerUrl}/tx/${deposit}`);
    for (let i = 0; i < 40 && balance < BigInt(fee.amount); i++) {
      await new Promise((r) => setTimeout(r, 3000));
      balance = BigInt(await nano.gatewayBalance(account.address));
    }
    console.log(`Gateway balance: ${usd(balance)}`);
  }

  // The same exchange the browser has with /api/advisory/check: 402, sign, retry.
  const res = await nano.paymentRequiredResponse(new Request("http://localhost/api/advisory/check"), fee);
  const { paymentRequired } = (await res.json()) as { paymentRequired: import("../lib/nano").PaymentRequired };
  const accepted = paymentRequired.accepts[0];
  const authorization = newAuthorization(account.address, accepted);
  const signature = await account.signTypedData(authorizationTypedData(authorization, accepted));
  const header = encodeHeader({ x402Version: paymentRequired.x402Version, payload: { authorization, signature }, resource: paymentRequired.resource, accepted });
  const started = Date.now();
  const result = await nano.collectFee(header, fee, `0x${"00".repeat(31)}01`);
  console.log(`Paid in ${Date.now() - started} ms:`, result);
  if (!result.ok) process.exit(1);
  console.log(`Gateway balance after: ${usd(await nano.gatewayBalance(account.address))}`);
  const replay = await nano.collectFee(header, fee, `0x${"00".repeat(31)}02`);
  console.log("Same signature again:", replay.ok ? "ACCEPTED (bad)" : `refused: ${replay.reason}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
