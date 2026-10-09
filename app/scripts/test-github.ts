// GitHub App integration test against a mock GitHub, on a local chain.
// Needs anvil with ReportBond deployed, and the app started with the GitHub settings below (see GITHUB_APP.md):
//   GITHUB_API_URL=http://127.0.0.1:4010 GITHUB_WEB_URL=http://127.0.0.1:4010
//   GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
//   GITHUB_WEBHOOK_SECRET, CRON_SECRET
// Run with the same env: NETWORK=local pnpm test:github
import "../jobs/env";
import { createHmac, createPublicKey, createVerify } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createTestClient, createWalletClient, http, parseEventLogs, publicActions, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { advisoryHashOf, repoIdOf } from "../lib/advisory";
import { encodeToken, signInMessage } from "../lib/auth";
import { reportBond } from "../lib/contract";
import { Verdict, verdictTypedData } from "../lib/eip712";
import { parseUsdc } from "../lib/format";
import { chain, config } from "../lib/network";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const MOCK_PORT = 4010;
const RUN = Date.now().toString(36);
const REPO = `octo/demo-${RUN}`;
const READONLY = `octo/readonly-${RUN}`;
const INSTALLATION = 111;

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

// ------------------------------------------------------------- mock GitHub

const patches: { repo: string; ghsa: string; state: string }[] = [];
const publicKey = createPublicKey(process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, "\n"));

function verifyAppJwt(auth: string | undefined): boolean {
  const [h, p, s] = (auth ?? "").replace("Bearer ", "").split(".");
  if (!s) return false;
  const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, Buffer.from(s, "base64url"));
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  return ok && String(payload.iss) === process.env.GITHUB_APP_ID && payload.exp > Date.now() / 1000;
}

async function readBody(req: IncomingMessage): Promise<string> {
  let s = "";
  for await (const c of req) s += c;
  return s;
}

const mock = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url!, `http://127.0.0.1:${MOCK_PORT}`);
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  const auth = req.headers.authorization;
  const body = await readBody(req);

  if (req.method === "POST" && url.pathname === "/login/oauth/access_token") {
    const { code, client_secret } = JSON.parse(body);
    if (client_secret !== process.env.GITHUB_CLIENT_SECRET) return send(200, { error_description: "bad client" });
    return send(200, { access_token: `user-${code}` });
  }
  if (url.pathname === "/user") return auth?.startsWith("Bearer user-") ? send(200, { login: "Octo-Maint" }) : send(401, {});
  if (url.pathname === "/user/installations") return send(200, { installations: [{ id: INSTALLATION }] });
  if (url.pathname === `/user/installations/${INSTALLATION}/repositories`) {
    return send(200, {
      repositories: [
        { id: 1, full_name: REPO, permissions: { admin: true } },
        { id: 2, full_name: READONLY, permissions: { admin: false, push: true } },
      ],
    });
  }
  if (req.method === "POST" && url.pathname === `/app/installations/${INSTALLATION}/access_tokens`) {
    if (!verifyAppJwt(auth)) return send(401, { message: "bad app jwt" });
    return send(201, { token: "inst-token", expires_at: new Date(Date.now() + 3600_000).toISOString() });
  }
  const m = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/security-advisories\/(GHSA-[\w-]+)$/);
  if (req.method === "PATCH" && m) {
    if (auth !== "Bearer inst-token") return send(401, { message: "bad installation token" });
    patches.push({ repo: m[1], ghsa: m[2], state: JSON.parse(body).state });
    return send(200, {});
  }
  send(404, { message: `mock: no route ${req.method} ${url.pathname}` });
});

// ------------------------------------------------------------------ helpers

const MNEMONIC = "test test test test test test test test test test test junk";
const [maintainer, reporter, stranger] = [0, 1, 2].map((i) => mnemonicToAccount(MNEMONIC, { addressIndex: i }));
const transport = http(config.rpcUrl);
const wallet = (a: typeof maintainer) => createWalletClient({ account: a, chain, transport }).extend(publicActions);
const client = wallet(maintainer);

async function call(path: string, init: RequestInit & { json?: unknown; cookie?: string } = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    redirect: "manual",
    method: init.json !== undefined ? "POST" : init.method,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}), ...init.headers },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body, headers: res.headers };
}

const cookieFrom = (h: Headers, name: string) =>
  h
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith(`${name}=`) && c.length > name.length + 1);

async function bearer(a: typeof maintainer) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const host = new URL(BASE).host;
  const signature = await a.signMessage({ message: signInMessage(a.address, issuedAt, host) });
  return { authorization: `Bearer ${encodeToken({ address: a.address.toLowerCase(), issuedAt, host, signature })}` };
}

let deliveryN = 0;
async function webhook(event: string, payload: unknown, opts: { delivery?: string; badSig?: boolean } = {}) {
  const raw = JSON.stringify(payload);
  const sig = createHmac("sha256", opts.badSig ? "wrong" : process.env.GITHUB_WEBHOOK_SECRET!).update(raw).digest("hex");
  return call("/api/github/webhook", {
    method: "POST",
    body: raw,
    headers: {
      "x-github-event": event,
      "x-github-delivery": opts.delivery ?? `${RUN}-${++deliveryN}`,
      "x-hub-signature-256": `sha256=${sig}`,
    },
  });
}

const ALPHABET = "23456789cfghjmpqrvwx";
// GitHub writes GHSA IDs in upper case; the server stores them that way.
const ghsa = (n: number) =>
  "GHSA-" + [0, 1, 2].map((g) => Array.from({ length: 4 }, (_, i) => ALPHABET[(RUN.charCodeAt((g * 4 + i) % RUN.length) + n * 5 + i) % 20]).join("")).join("-").toUpperCase();
const advisoryUrl = (id: string) => `https://github.com/${REPO}/security/advisories/${id}`;

function advisoryPayload(id: string, createdAt: Date) {
  return {
    action: "reported",
    repository_advisory: { ghsa_id: id, html_url: advisoryUrl(id), state: "triage", created_at: createdAt.toISOString(), author: { login: "Researcher-1" } },
    repository: { full_name: REPO },
    installation: { id: INSTALLATION },
    sender: { login: "Researcher-1" },
  };
}

async function send(a: typeof maintainer, functionName: string, args: unknown[], value?: bigint) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hash = await wallet(a).writeContract({ ...reportBond, functionName, args, value } as any);
  const r = await client.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted`);
  return r;
}

async function relay(reportId: bigint, verdict: Verdict, bounty: bigint) {
  const td = verdictTypedData({
    chainId: chain.id,
    contract: reportBond.address,
    reportId,
    verdict,
    bounty,
    deadline: (await client.getBlock()).timestamp + 3600n,
  });
  const signature = await maintainer.signTypedData(td);
  const res = await call("/api/relay/verdict", {
    json: { reportId: reportId.toString(), verdict, bounty: bounty.toString(), deadline: td.message.deadline.toString(), signature },
  });
  if (res.body.hash) await client.waitForTransactionReceipt({ hash: res.body.hash as Hex });
  return res;
}

async function waitForPatch(id: string, ms = 20_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const p = patches.find((x) => x.ghsa === id);
    if (p) return p;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

// --------------------------------------------------------------------- test

async function main() {
  if (config.network !== "local") throw new Error("Run with NETWORK=local");
  await new Promise<void>((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));
  await createTestClient({ chain, mode: "anvil", transport }).setBalance({
    address: process.env.RELAYER_ADDRESS as Hex,
    value: parseUsdc("100"),
  });

  console.log("Connect GitHub");
  const s0 = await call("/api/github/session");
  check("GitHub is configured, not connected yet", s0.body.configured === true && s0.body.connected === false, s0.body);

  const c1 = await call("/api/github/connect?mode=install");
  const loc1 = c1.headers.get("location") ?? "";
  check("connect redirects to the app install page", c1.status === 302 && loc1.includes(`/apps/${process.env.GITHUB_APP_SLUG}/installations/new`), loc1);
  const bad = await call(`/api/github/callback?code=x&state=forged`, { cookie: cookieFrom(c1.headers, "rb_gh_state") });
  check("callback with a forged state is refused", (bad.headers.get("location") ?? "").includes("github=expired"), bad.headers.get("location"));

  const c2 = await call("/api/github/connect?mode=signin");
  const state = new URL(c2.headers.get("location")!).searchParams.get("state")!;
  check("sign-in mode goes to OAuth authorize", (c2.headers.get("location") ?? "").includes("/login/oauth/authorize"));
  const cb = await call(`/api/github/callback?code=abc&state=${state}`, { cookie: cookieFrom(c2.headers, "rb_gh_state") });
  check("callback signs in", (cb.headers.get("location") ?? "").includes("github=connected"), cb.headers.get("location"));
  const session = cookieFrom(cb.headers, "rb_gh")!;
  const s1 = await call("/api/github/session", { cookie: session });
  check(
    "session lists only repos where the user is admin",
    s1.body.login === "octo-maint" && JSON.stringify(s1.body.repos) === JSON.stringify([REPO]),
    s1.body,
  );

  console.log("Verify pools");
  const mk = async (repo: string) => {
    const r = await send(maintainer, "createPool", [repoIdOf(repo), maintainer.address, parseUsdc("5"), 300n, parseUsdc("3")], parseUsdc("10"));
    return parseEventLogs({ abi: reportBond.abi, eventName: "PoolCreated", logs: r.logs })[0].args.poolId;
  };
  const poolId = await mk(REPO);
  const readonlyPool = await mk(READONLY);
  const auth = await bearer(maintainer);
  check("verify without GitHub session -> 401", (await call(`/api/pools/${poolId}/verify`, { json: { repo: REPO }, headers: auth })).status === 401);
  check("verify without wallet sign-in -> 401", (await call(`/api/pools/${poolId}/verify`, { json: { repo: REPO }, cookie: session })).status === 401);
  check(
    "verify from a wallet that didn't create the pool -> 403",
    (await call(`/api/pools/${poolId}/verify`, { json: { repo: REPO }, cookie: session, headers: await bearer(stranger) })).status === 403,
  );
  check(
    "verify a repo the user isn't admin of -> 403",
    (await call(`/api/pools/${readonlyPool}/verify`, { json: { repo: READONLY }, cookie: session, headers: auth })).status === 403,
  );
  check(
    "verify a different repo than the pool's -> 400",
    (await call(`/api/pools/${readonlyPool}/verify`, { json: { repo: REPO }, cookie: session, headers: auth })).status === 400,
  );
  const v = await call(`/api/pools/${poolId}/verify`, { json: { repo: REPO }, cookie: session, headers: auth });
  check("verify succeeds for the admin who created the pool", v.status === 200, v.body);
  const pool = await call(`/api/pools/${poolId}`);
  const p = pool.body.pool as { verifiedBy: string; repoName: string };
  check("pool shows verified maintainer and repo name", p?.verifiedBy === "octo-maint" && p?.repoName === REPO, p);

  console.log("Webhooks");
  check("bad signature -> 401", (await webhook("installation", {}, { badSig: true })).status === 401);
  const inst = { action: "created", installation: { id: INSTALLATION, account: { login: "octo" } }, repositories: [{ id: 1, full_name: REPO }] };
  const w1 = await webhook("installation", inst, { delivery: `${RUN}-inst` });
  check("installation recorded", w1.status === 200 && w1.body.applied === true, w1.body);
  const w2 = await webhook("installation", inst, { delivery: `${RUN}-inst` });
  check("redelivered webhook applied once", w2.body.applied === false, w2.body);

  const [A, B, C] = [ghsa(1), ghsa(2), ghsa(3)];
  await webhook("repository_advisory", advisoryPayload(A, new Date()));
  await webhook("repository_advisory", advisoryPayload(B, new Date(Date.now() - 3 * 86400_000)));
  await webhook("repository_advisory", advisoryPayload(C, new Date()));

  console.log("Report tracker");
  type T = { ghsa: string; bond: string; reportId: number | null; reporter: string };
  const list = async () => ((await call(`/api/github/reports?pool=${poolId}`, { headers: auth })).body.reports ?? []) as T[];
  check(
    "tracker is private to the pool creator",
    (await call(`/api/github/reports?pool=${poolId}`, { headers: await bearer(stranger) })).status === 403,
  );
  let reports = await list();
  const find = (id: string) => reports.find((r) => r.ghsa === id);
  check("new report awaits a deposit", find(A)?.bond === "awaiting" && find(A)?.reporter === "researcher-1", find(A));
  check("report past the 48h window is unbonded", find(B)?.bond === "unbonded", find(B));

  const deposit = async (id: string) => {
    const r = await send(reporter, "submitReport", [poolId, advisoryHashOf(advisoryUrl(id))], parseUsdc("5"));
    return parseEventLogs({ abi: reportBond.abi, eventName: "ReportSubmitted", logs: r.logs })[0].args.reportId;
  };
  const rA = await deposit(A);
  const rC = await deposit(C);
  reports = await list();
  check("deposit links the GitHub report to the on-chain report", find(A)?.bond === "bonded" && find(A)?.reportId === Number(rA), find(A));

  console.log("Verdicts written back to GitHub");
  check("Valid verdict relayed", Boolean((await relay(rA, Verdict.Valid, parseUsdc("1"))).body.hash));
  const pA = await waitForPatch(A);
  check("Valid accepts the advisory on GitHub (draft)", pA?.state === "draft" && pA?.repo === REPO, pA);
  check("Slop verdict relayed", Boolean((await relay(rC, Verdict.Slop, 0n)).body.hash));
  const pC = await waitForPatch(C);
  check("Slop closes the advisory on GitHub", pC?.state === "closed", pC);

  const cron = await call("/api/cron/keeper", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  const gsync = cron.body.github as { synced: string[]; failed: unknown[] } | undefined;
  check("hourly cron finds nothing left to sync", gsync?.synced.length === 0 && gsync?.failed.length === 0, cron.body);
  check("each advisory was patched exactly once", patches.filter((x) => x.ghsa === A).length === 1 && patches.filter((x) => x.ghsa === C).length === 1, patches);

  const logout = await call("/api/github/logout", { json: {}, cookie: session });
  const s2 = await call("/api/github/session", { cookie: session });
  check("disconnect ends the session", logout.status === 200 && s2.body.connected === false, s2.body);

  mock.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  mock.close();
  process.exit(1);
});
