// Layer 2 local end-to-end (docs/TESTING.md): anvil + the app's API, relayer, sign-in and keeper.
// Needs: anvil running, ReportBond deployed at the local address, and `NETWORK=local pnpm dev` on :3000.
// Run:   NETWORK=local pnpm e2e
import "../jobs/env";
import { execSync } from "node:child_process";
import { createTestClient, createWalletClient, http, parseEventLogs, publicActions, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { advisoryHashOf, repoIdOf } from "../lib/advisory";
import { encodeToken, signInMessage } from "../lib/auth";
import { reportBond } from "../lib/contract";
import { Verdict, verdictTypedData } from "../lib/eip712";
import { parseUsdc } from "../lib/format";
import { chain } from "../lib/network";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const MNEMONIC = "test test test test test test test test test test test junk";
const [maintainer, reporter, stranger] = [0, 1, 2].map((i) => mnemonicToAccount(MNEMONIC, { addressIndex: i }));
const transport = http(chain.rpcUrls.default.http[0]);
const testClient = createTestClient({ chain, mode: "anvil", transport });
const wallet = (account: typeof maintainer) => createWalletClient({ account, chain, transport }).extend(publicActions);

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
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

async function send(account: typeof maintainer, functionName: string, args: unknown[], value?: bigint) {
  const w = wallet(account);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hash = await w.writeContract({ ...reportBond, functionName, args, value } as any);
  const receipt = await w.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted`);
  return receipt;
}

async function token(account: typeof maintainer) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const host = new URL(BASE).host;
  const signature = await account.signMessage({ message: signInMessage(account.address, issuedAt, host) });
  return `Bearer ${encodeToken({ address: account.address.toLowerCase(), issuedAt, host, signature })}`;
}

async function signedVerdict(reportId: bigint, verdict: Verdict, bounty: bigint) {
  const chainNow = (await wallet(maintainer).getBlock()).timestamp;
  const td = verdictTypedData({ chainId: chain.id, contract: reportBond.address, reportId, verdict, bounty, deadline: chainNow + 3600n });
  const signature = await maintainer.signTypedData(td);
  return { reportId: reportId.toString(), verdict, bounty: bounty.toString(), deadline: td.message.deadline.toString(), signature };
}

async function relay(reportId: bigint, verdict: Verdict, bounty: bigint) {
  const res = await call("/api/relay/verdict", { json: await signedVerdict(reportId, verdict, bounty) });
  if (res.body.hash) await wallet(maintainer).waitForTransactionReceipt({ hash: res.body.hash as Hex });
  return res;
}

const REPO = `reportbond/demo-${Date.now()}`;
const advisory = (n: number) => `https://github.com/${REPO}/security/advisories/GHSA-${"23456789cfghjmpqrvwx"[n % 20]}xxx-xxxx-xxxx`;

async function submit(n: number) {
  const receipt = await send(reporter, "submitReport", [poolId, advisoryHashOf(advisory(n))], parseUsdc("5"));
  const [ev] = parseEventLogs({ abi: reportBond.abi, eventName: "ReportSubmitted", logs: receipt.logs });
  const saved = await call(`/api/reports/${ev.args.reportId}/advisory`, { json: { url: advisory(n) } });
  check(`advisory link stored for #${ev.args.reportId}`, saved.status === 200, saved.body);
  return ev.args.reportId;
}

let poolId = 0n;

async function main() {
  const relayer = process.env.RELAYER_ADDRESS as Hex;
  await testClient.setBalance({ address: relayer, value: parseUsdc("100") });

  const status = await call("/api/status");
  check("status: local, deployed", status.body.network === "local" && status.body.deployed, status.body);

  console.log("Pool");
  const receipt = await send(maintainer, "createPool", [repoIdOf(REPO), maintainer.address, parseUsdc("5"), 300n, parseUsdc("3")], parseUsdc("10"));
  poolId = parseEventLogs({ abi: reportBond.abi, eventName: "PoolCreated", logs: receipt.logs })[0].args.poolId;
  check("wrong repo name rejected", (await call(`/api/pools/${poolId}/repo`, { json: { repo: "evil/other" } })).status === 400);
  check("repo name accepted", (await call(`/api/pools/${poolId}/repo`, { json: { repo: REPO } })).status === 200);
  const pool = await call(`/api/pools/${poolId}`);
  check("pool page data", pool.body.pool?.repoName === REPO && pool.body.pool?.available === parseUsdc("10").toString(), pool.body);

  console.log("Advisory check");
  check("not an advisory link", (await call("/api/advisory/check", { json: { poolId: Number(poolId), url: "https://example.com" } })).status === 400);
  check(
    "advisory on another repo",
    (await call("/api/advisory/check", { json: { poolId: Number(poolId), url: "https://github.com/a/b/security/advisories/GHSA-2222-3333-4444" } })).status === 400,
  );
  const ok = await call("/api/advisory/check", { json: { poolId: Number(poolId), url: advisory(0) } });
  check("valid advisory accepted, hash matches", ok.body.advisoryHash === advisoryHashOf(advisory(0)), ok.body);

  console.log("A. Valid");
  const a = await submit(0);
  const dup = await call("/api/advisory/check", { json: { poolId: Number(poolId), url: advisory(0) } });
  check("duplicate open advisory rejected", dup.status === 400 && /already has an open report/.test(dup.body.error), dup);
  check("advisory link: no sign-in -> 401", (await call(`/api/reports/${a}/advisory`)).status === 401);
  check("advisory link: stranger -> 403", (await call(`/api/reports/${a}/advisory`, { headers: { authorization: await token(stranger) } })).status === 403);
  const asReporter = await call(`/api/reports/${a}/advisory`, { headers: { authorization: await token(reporter) } });
  check("advisory link: reporter sees it", asReporter.body.url === advisory(0).toLowerCase(), asReporter.body);
  const asCreator = await call(`/api/reports/${a}/advisory`, { headers: { authorization: await token(maintainer) } });
  check("advisory link: pool creator sees it", asCreator.status === 200);
  const va = await relay(a, Verdict.Valid, parseUsdc("2"));
  check("relayed Valid verdict", Boolean(va.body.hash), va.body);
  check("status Valid", (await call(`/api/reports/${a}`)).body.report?.status === 3);

  console.log("B. Mistake");
  const b = await submit(1);
  check("relayed Mistake verdict", Boolean((await relay(b, Verdict.Mistake, 0n)).body.hash));

  console.log("C. Slop");
  const c = await submit(2);
  check("relayed Slop verdict", Boolean((await relay(c, Verdict.Slop, 0n)).body.hash));

  console.log("E. Tampered and replayed");
  const e = await submit(3);
  const sig = await signedVerdict(e, Verdict.Slop, 0n);
  const tampered = await call("/api/relay/verdict", { json: { ...sig, verdict: Verdict.Valid } });
  check("Slop signature changed to Valid -> InvalidSignature", tampered.body.code === "InvalidSignature", tampered.body);
  const first = await call("/api/relay/verdict", { json: sig });
  await wallet(maintainer).waitForTransactionReceipt({ hash: first.body.hash });
  const replay = await call("/api/relay/verdict", { json: sig });
  check("replayed signature -> ReportNotOpen", replay.body.code === "ReportNotOpen", replay.body);

  console.log("D. No response (keeper)");
  const d = await submit(4);
  await testClient.increaseTime({ seconds: 301 });
  await testClient.mine({ blocks: 1 });
  execSync("pnpm keeper --once", { stdio: "inherit", env: { ...process.env, NETWORK: "local" } });
  check("keeper refunded", (await call(`/api/reports/${d}`)).body.report?.status === 6);
  execSync("pnpm keeper --once", { stdio: "inherit", env: { ...process.env, NETWORK: "local" } });
  check("keeper safe to run twice", true);

  console.log("Withdraw and balances");
  const credits = (await wallet(reporter).readContract({ ...reportBond, functionName: "credits", args: [reporter.address] })) as bigint;
  check("reporter credited 7 + 5 + 5 = 17", credits === parseUsdc("17"), credits.toString());
  await send(reporter, "withdraw", []);
  const after = await call(`/api/pools/${poolId}`);
  // funded 10 - 2 bounty = 8; slashed 5 (C) + 5 (E) = 10
  check("pool funded 8.00", after.body.pool?.fundedBalance === parseUsdc("8").toString(), after.body.pool);
  check("pool slashed 10.00", after.body.pool?.slashedBalance === parseUsdc("10").toString(), after.body.pool);
  check(
    "pool outcomes",
    JSON.stringify(after.body.pool?.outcomes) === JSON.stringify({ valid: 1, mistake: 1, slop: 2, refunded: 1 }),
    after.body.pool?.outcomes,
  );

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
