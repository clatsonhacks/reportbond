// End-to-end scenarios (docs/TESTING.md) through the app's API, relayer, sign-in and keeper.
//   Local (Layer 2):   anvil running, contract deployed, `NETWORK=local pnpm dev`;   then `NETWORK=local pnpm e2e`
//   Testnet (Layer 3): TEST_* wallets funded in .env, `pnpm dev` on testnet;          then `pnpm e2e`
// On testnet the no-response report is filed first, so its 5-minute timeout runs while the others are tested.
// Scenario D never touches our API: a stranger refunds straight on the chain, as if our server were down.
import "../jobs/env";
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createTestClient, createWalletClient, fallback, http, parseEventLogs, publicActions, type Hex } from "viem";
import { mnemonicToAccount, privateKeyToAccount } from "viem/accounts";
import { advisoryHashOf, repoIdOf } from "../lib/advisory";
import { encodeToken, signInMessage } from "../lib/auth";
import { reportBond } from "../lib/contract";
import { Verdict, verdictTypedData } from "../lib/eip712";
import { formatUsdc, parseUsdc } from "../lib/format";
import { chain, config, txUrl } from "../lib/network";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const local = config.network === "local";
const TIMEOUT = 300n; // 5 minutes, as in docs/TESTING.md

type Account = ReturnType<typeof privateKeyToAccount> | ReturnType<typeof mnemonicToAccount>;
function accounts(): Account[] {
  if (local) {
    const m = "test test test test test test test test test test test junk";
    return [0, 1, 2].map((i) => mnemonicToAccount(m, { addressIndex: i }));
  }
  return ["MAINTAINER", "REPORTER", "STRANGER"].map((r) => {
    const key = process.env[`TEST_${r}_PRIVATE_KEY`] as Hex | undefined;
    if (!key) throw new Error(`TEST_${r}_PRIVATE_KEY is not set in .env`);
    return privateKeyToAccount(key);
  });
}
const [maintainer, reporter, stranger] = accounts();
const transport = local ? http(config.rpcUrl) : fallback([http(config.rpcFallbackUrl), http(config.rpcUrl)]);
const wallet = (account: Account) => createWalletClient({ account, chain, transport }).extend(publicActions);
const chainClient = wallet(maintainer);

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const txLog: { scenario: string; step: string; hash: string }[] = [];
function record(scenario: string, step: string, hash: string) {
  txLog.push({ scenario, step, hash });
}

async function call(path: string, init?: RequestInit & { json?: unknown }) {
  const res = await fetch(BASE + path, {
    ...init,
    method: init?.json !== undefined ? "POST" : init?.method,
    body: init?.json !== undefined ? JSON.stringify(init.json) : undefined,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

async function send(account: Account, functionName: string, args: unknown[], value?: bigint) {
  const w = wallet(account);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hash = await w.writeContract({ ...reportBond, functionName, args, value } as any);
  const receipt = await w.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted: ${hash}`);
  return receipt;
}

async function token(account: Account) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const host = new URL(BASE).host;
  const signature = await account.signMessage({ message: signInMessage(account.address, issuedAt, host) });
  return `Bearer ${encodeToken({ address: account.address.toLowerCase(), issuedAt, host, signature })}`;
}

const chainNow = async () => (await chainClient.getBlock()).timestamp;

async function signedVerdict(reportId: bigint, verdict: Verdict, bounty: bigint) {
  const td = verdictTypedData({
    chainId: chain.id,
    contract: reportBond.address,
    reportId,
    verdict,
    bounty,
    deadline: (await chainNow()) + 3600n,
  });
  const signature = await maintainer.signTypedData(td);
  return { reportId: reportId.toString(), verdict, bounty: bounty.toString(), deadline: td.message.deadline.toString(), signature };
}

async function relay(scenario: string, reportId: bigint, verdict: Verdict, bounty: bigint) {
  const res = await call("/api/relay/verdict", { json: await signedVerdict(reportId, verdict, bounty) });
  if (res.body.hash) {
    await chainClient.waitForTransactionReceipt({ hash: res.body.hash as Hex });
    record(scenario, "verdict (relayed)", res.body.hash);
  }
  return res;
}

const REPO = local ? `reportbond/demo-${Date.now()}` : "clatsonhacks/reportbond-demo-testnet";
const RUN = Date.now().toString(36);
// GHSA IDs use a restricted alphabet; derive a unique one per report and run.
const ALPHABET = "23456789cfghjmpqrvwx";
const ghsa = (n: number) =>
  Array.from({ length: 3 }, (_, g) =>
    Array.from({ length: 4 }, (_, i) => ALPHABET[(RUN.charCodeAt((g * 4 + i) % RUN.length) + n * 7 + g * 4 + i) % 20]).join(""),
  ).join("-");
const advisory = (n: number) => `https://github.com/${REPO}/security/advisories/GHSA-${ghsa(n)}`;

let poolId = 0n;

async function submit(scenario: string, n: number) {
  const receipt = await send(reporter, "submitReport", [poolId, advisoryHashOf(advisory(n))], parseUsdc("5"));
  record(scenario, "deposit 5.00", receipt.transactionHash);
  const [ev] = parseEventLogs({ abi: reportBond.abi, eventName: "ReportSubmitted", logs: receipt.logs });
  const saved = await call(`/api/reports/${ev.args.reportId}/advisory`, { json: { url: advisory(n) } });
  check(`advisory link stored for #${ev.args.reportId}`, saved.status === 200, saved.body);
  return ev.args.reportId;
}

const credits = async () =>
  (await chainClient.readContract({ ...reportBond, functionName: "credits", args: [reporter.address] })) as bigint;

async function main() {
  console.log(`Network: ${config.network} (${chain.id}), contract ${config.contractAddress}\n`);
  const status = await call("/api/status");
  check(`app is on ${config.network} and sees the contract`, status.body.network === config.network && status.body.deployed, status.body);

  if (local) {
    const test = createTestClient({ chain, mode: "anvil", transport });
    await test.setBalance({ address: process.env.RELAYER_ADDRESS as Hex, value: parseUsdc("100") });
  }

  // Start from zero credits so the totals below are exact.
  if ((await credits()) > 0n) await send(reporter, "withdraw", []);

  console.log("Pool");
  const created = await send(maintainer, "createPool", [repoIdOf(REPO), maintainer.address, parseUsdc("5"), TIMEOUT, parseUsdc("3")], parseUsdc("10"));
  record("setup", "create pool, fund 10.00", created.transactionHash);
  poolId = parseEventLogs({ abi: reportBond.abi, eventName: "PoolCreated", logs: created.logs })[0].args.poolId;
  check("wrong repo name rejected", (await call(`/api/pools/${poolId}/repo`, { json: { repo: "evil/other" } })).status === 400);
  check("repo name accepted", (await call(`/api/pools/${poolId}/repo`, { json: { repo: REPO } })).status === 200);
  const pool = await call(`/api/pools/${poolId}`);
  check("pool page data", pool.body.pool?.repoName === REPO && pool.body.pool?.available === parseUsdc("10").toString(), pool.body);

  console.log("D. No response (filed first, refunded at the end)");
  const d = await submit("D", 4);
  const dDeadline = BigInt((await call(`/api/reports/${d}`)).body.report.deadline);

  console.log("Advisory check");
  check("not an advisory link", (await call("/api/advisory/check", { json: { poolId: Number(poolId), url: "https://example.com" } })).status === 400);
  check(
    "advisory on another repo",
    (await call("/api/advisory/check", { json: { poolId: Number(poolId), url: "https://github.com/a/b/security/advisories/GHSA-2222-3333-4444" } })).status === 400,
  );
  const ok = await call("/api/advisory/check", { json: { poolId: Number(poolId), url: advisory(0) } });
  check("valid advisory accepted, hash matches", ok.body.advisoryHash === advisoryHashOf(advisory(0)), ok.body);

  console.log("A. Valid");
  const a = await submit("A", 0);
  const dup = await call("/api/advisory/check", { json: { poolId: Number(poolId), url: advisory(0) } });
  check("duplicate open advisory rejected", dup.status === 400 && /already has an open report/.test(dup.body.error), dup);
  check("advisory link: no sign-in -> 401", (await call(`/api/reports/${a}/advisory`)).status === 401);
  check("advisory link: stranger -> 403", (await call(`/api/reports/${a}/advisory`, { headers: { authorization: await token(stranger) } })).status === 403);
  const asReporter = await call(`/api/reports/${a}/advisory`, { headers: { authorization: await token(reporter) } });
  check("advisory link: reporter sees it", asReporter.body.url === advisory(0).toLowerCase(), asReporter.body);
  check("advisory link: pool creator sees it", (await call(`/api/reports/${a}/advisory`, { headers: { authorization: await token(maintainer) } })).status === 200);
  const va = await relay("A", a, Verdict.Valid, parseUsdc("2"));
  check("relayed Valid verdict with 2.00 bounty", Boolean(va.body.hash), va.body);
  check("status Valid", (await call(`/api/reports/${a}`)).body.report?.status === 3);

  console.log("B. Mistake");
  check("relayed Mistake verdict", Boolean((await relay("B", await submit("B", 1), Verdict.Mistake, 0n)).body.hash));

  console.log("C. Slop");
  check("relayed Slop verdict", Boolean((await relay("C", await submit("C", 2), Verdict.Slop, 0n)).body.hash));
  const slopWithdraw = await call(`/api/pools/${poolId}`);
  check("slashed 5.00 is not withdrawable (only funded money is)", slopWithdraw.body.pool?.slashedBalance === parseUsdc("5").toString(), slopWithdraw.body.pool);

  console.log("E. Tampered and replayed");
  const e = await submit("E", 3);
  const sig = await signedVerdict(e, Verdict.Slop, 0n);
  const tampered = await call("/api/relay/verdict", { json: { ...sig, verdict: Verdict.Valid } });
  check("Slop signature changed to Valid -> InvalidSignature", tampered.body.code === "InvalidSignature", tampered.body);
  const first = await call("/api/relay/verdict", { json: sig });
  await chainClient.waitForTransactionReceipt({ hash: first.body.hash });
  record("E", "original Slop verdict", first.body.hash);
  const replay = await call("/api/relay/verdict", { json: sig });
  check("replayed signature -> ReportNotOpen", replay.body.code === "ReportNotOpen", replay.body);

  console.log("D. No response, refunded without our server");
  if (local) {
    const test = createTestClient({ chain, mode: "anvil", transport });
    await test.increaseTime({ seconds: Number(TIMEOUT) + 1 });
    await test.mine({ blocks: 1 });
  } else {
    for (let now = await chainNow(); now < dDeadline; now = await chainNow()) {
      console.log(`  waiting for the deadline: ${Number(dDeadline - now)} s left`);
      await new Promise((r) => setTimeout(r, Math.min(30_000, Number(dDeadline - now) * 1000 + 2_000)));
    }
  }
  // Straight to the contract, signed by a stranger: no API, no relayer, no keeper.
  const refund = await send(stranger, "refundExpired", [d]);
  record("D", "refund by stranger, direct to contract", refund.transactionHash);
  check("stranger refunded the expired report directly", refund.status === "success");
  execSync("pnpm keeper --once", { stdio: "inherit", env: { ...process.env, NETWORK: config.network } });
  check("keeper afterwards finds nothing to do (safe to run twice)", true);

  console.log("Withdraw and balances");
  const owed = await credits();
  check("reporter credited 7.00 (A) + 5.00 (B) + 5.00 (D) = 17.00", owed === parseUsdc("17"), formatUsdc(owed));
  const before = await chainClient.getBalance({ address: reporter.address });
  const w = await send(reporter, "withdraw", []);
  record("A/B/D", "reporter withdraws 17.00", w.transactionHash);
  const after = await chainClient.getBalance({ address: reporter.address });
  const gas = w.gasUsed * w.effectiveGasPrice;
  check("reporter received exactly 17.00 (plus gas paid)", after - before + gas === parseUsdc("17"), formatUsdc(after - before));
  const final = await call(`/api/pools/${poolId}`);
  check("pool funded 8.00 (10 - 2 bounty)", final.body.pool?.fundedBalance === parseUsdc("8").toString(), final.body.pool);
  check("pool slashed 10.00 (C + E)", final.body.pool?.slashedBalance === parseUsdc("10").toString(), final.body.pool);
  check(
    "pool outcomes",
    JSON.stringify(final.body.pool?.outcomes) === JSON.stringify({ valid: 1, mistake: 1, slop: 2, refunded: 1 }),
    final.body.pool?.outcomes,
  );

  console.log("\nTransactions");
  for (const t of txLog) console.log(`  ${t.scenario.padEnd(6)} ${t.step.padEnd(40)} ${txUrl(t.hash) ?? t.hash}`);
  mkdirSync(".data", { recursive: true });
  const out = `.data/e2e-${config.network}-${RUN}.json`;
  writeFileSync(out, JSON.stringify({ network: config.network, contract: config.contractAddress, poolId: poolId.toString(), repo: REPO, failures, txs: txLog.map((t) => ({ ...t, url: txUrl(t.hash) })) }, null, 2));
  console.log(`\nSaved to app/${out}`);

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
