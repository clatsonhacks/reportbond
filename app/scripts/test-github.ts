// GitHub App integration test against a mock GitHub, on a local chain.
// Needs anvil with ReportBond deployed, and the app started with the GitHub settings below (see GITHUB_APP.md):
//   GITHUB_API_URL=http://127.0.0.1:4010 GITHUB_WEB_URL=http://127.0.0.1:4010
//   GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET,
//   GITHUB_WEBHOOK_SECRET, CRON_SECRET
//   and for the agents: AI_PROVIDER=groq GROQ_API_KEY=mock GROQ_BASE_URL=http://127.0.0.1:4010
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
  if (url.pathname === "/user") {
    if (!auth?.startsWith("Bearer user-")) return send(401, {});
    return send(200, { login: auth === "Bearer user-reporter" ? "Researcher-1" : "Octo-Maint" });
  }
  if (url.pathname === "/user/installations") {
    return send(200, { installations: auth === "Bearer user-reporter" ? [] : [{ id: INSTALLATION }] });
  }
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
  if (req.method === "GET" && m) {
    return send(200, {
      ghsa_id: m[2],
      state: "triage",
      severity: "high",
      summary: "Overflow in read_name()",
      description: "read_name() in src/app.c:3 copies input without a length check. Reproduce with a 200 byte name.",
      cwe_ids: [],
      vulnerabilities: [],
    });
  }
  if (req.method === "PATCH" && m) {
    if (auth !== "Bearer inst-token") return send(401, { message: "bad installation token" });
    patches.push({ repo: m[1], ghsa: m[2], state: JSON.parse(body).state });
    return send(200, {});
  }
  // The repository the agents read.
  if (url.pathname === `/repos/${REPO}`) return send(200, { full_name: REPO, default_branch: "main", description: "Demo", language: "C" });
  if (url.pathname === `/repos/${REPO}/git/trees/main`) {
    return send(200, { truncated: false, tree: Object.keys(REPO_FILES).map((f) => ({ path: f, type: "blob" })) });
  }
  if (url.pathname.startsWith(`/repos/${REPO}/contents/`)) {
    const file = decodeURIComponent(url.pathname.slice(`/repos/${REPO}/contents/`.length));
    if (!(file in REPO_FILES)) return send(404, { message: "Not Found" });
    return send(200, { type: "file", encoding: "base64", size: REPO_FILES[file].length, content: Buffer.from(REPO_FILES[file]).toString("base64") });
  }
  if (url.pathname === "/search/code") return send(200, { items: [] });
  // The model (Groq-compatible), answering by which schema was asked for.
  if (req.method === "POST" && url.pathname === "/chat/completions") {
    const parsed = JSON.parse(body);
    // An investigation request (tools, no schema): read the cited file once, then write findings.
    if (parsed.tools && !parsed.response_format) {
      const done = parsed.messages.some((m: { role: string }) => m.role === "tool");
      modelCalls.push(done ? "findings" : "tool_calls");
      const message = done
        ? { content: "read_name copies without a length check." }
        : { content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "read_file", arguments: JSON.stringify({ path: "src/app.c" }) } }] };
      return send(200, { model: "mock-model", choices: [{ finish_reason: done ? "stop" : "tool_calls", message }] });
    }
    const name = parsed.response_format?.json_schema?.name as string;
    modelCalls.push(name);
    const answer =
      name === "rulebook"
        ? CANNED_RULES
        : name === "triage"
          ? { verdict: "valid", confidence: 0.9, severity: "high", summary: "Unchecked copy in read_name.", evidence: [], inScope: true, injectionSuspected: false }
          : { agrees: true, confidence: 0.85, issues: [], injectionSuspected: false };
    return send(200, { model: "mock-model", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(answer) } }] });
  }
  send(404, { message: `mock: no route ${req.method} ${url.pathname}` });
});

const REPO_FILES: Record<string, string> = {
  "README.md": "# demo",
  "src/app.c": "#include <string.h>\nvoid read_name(char *dst, const char *src) {\n  strcpy(dst, src);\n}\n",
};
const modelCalls: string[] = [];
const CANNED_RULES = {
  summary: "Demo project bounty.",
  inScope: ["src/"],
  outOfScope: ["tests/"],
  severity: [
    { level: "low", description: "Minor", payoutPercent: 10 },
    { level: "medium", description: "DoS", payoutPercent: 25 },
    { level: "high", description: "Memory corruption", payoutPercent: 50 },
    { level: "critical", description: "Code execution", payoutPercent: 100 },
  ],
  validCriteria: ["Reproduction steps"],
  slopSignals: ["Cites code that does not exist"],
};

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

  console.log("Reporter identity");
  type Who = { ghsa: string; reporterMatch: string; depositorLogin: string | null; depositor: string | null };
  const who = async (id: string) => ((await call(`/api/github/reports?pool=${poolId}`, { headers: auth })).body.reports as Who[]).find((r) => r.ghsa === id);
  const before = await who(A);
  check("before linking, the depositor is an unlinked wallet", before?.reporterMatch === "unknown" && before?.depositor === reporter.address.toLowerCase(), before);

  const evil = await call("/api/github/connect?mode=signin&next=//evil.example/x");
  const evilState = new URL(evil.headers.get("location")!).searchParams.get("state")!;
  const evilCookies = evil.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");
  const evilBack = await call(`/api/github/callback?code=reporter&state=${evilState}`, { cookie: evilCookies });
  check("sign-in never redirects off-site", new URL(evilBack.headers.get("location")!).pathname === "/maintainer", evilBack.headers.get("location"));

  const next = `/pool/${poolId}/report`;
  const rc = await call(`/api/github/connect?mode=signin&next=${encodeURIComponent(next)}`);
  const rState = new URL(rc.headers.get("location")!).searchParams.get("state")!;
  const rCookies = rc.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => !c.endsWith("=")).join("; ");
  const rcb = await call(`/api/github/callback?code=reporter&state=${rState}`, { cookie: rCookies });
  const backTo = new URL(rcb.headers.get("location")!);
  check("a reporter signs in and returns to the report flow", backTo.pathname === next && backTo.searchParams.get("github") === "connected", rcb.headers.get("location"));
  const reporterSession = cookieFrom(rcb.headers, "rb_gh")!;
  const rs = await call("/api/github/session", { cookie: reporterSession });
  check("the reporter's session has their login and no repositories", rs.body.login === "researcher-1" && (rs.body.repos as string[]).length === 0, rs.body);

  const reporterAuth = await bearer(reporter);
  check("linking needs a GitHub session", (await call("/api/github/link", { json: {}, headers: reporterAuth })).status === 401);
  check("linking needs a wallet signature", (await call("/api/github/link", { json: {}, cookie: reporterSession })).status === 401);
  const linked = await call("/api/github/link", { json: {}, cookie: reporterSession, headers: reporterAuth });
  check("with both, the wallet is linked to the GitHub account", linked.status === 200 && linked.body.login === "researcher-1", linked.body);
  check("the wallet can read its own link", (await call("/api/github/link", { headers: reporterAuth })).body.login === "researcher-1");
  check("another wallet has no link", (await call("/api/github/link", { headers: await bearer(stranger) })).body.login === null);
  const matched = await who(A);
  check("the tracker shows the deposit came from the account that filed the report", matched?.reporterMatch === "match" && matched?.depositorLogin === "researcher-1", matched);

  // The same wallet linked to a different GitHub account than the filer is flagged.
  await call("/api/github/link", { json: {}, cookie: session, headers: reporterAuth });
  const mismatched = await who(A);
  check("a deposit from a wallet linked to someone else is flagged", mismatched?.reporterMatch === "mismatch" && mismatched?.depositorLogin === "octo-maint", mismatched);
  const unlink = await call("/api/github/link", { method: "DELETE", headers: reporterAuth });
  check("unlinking returns it to unknown", unlink.status === 200 && (await who(A))?.reporterMatch === "unknown");

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

  console.log("Rules and AI review");
  const rulesUrl = `/api/pools/${poolId}/rules`;
  const r0 = await call(rulesUrl);
  check("no rules yet; the AI is configured", r0.body.published === null && r0.body.aiConfigured === true, r0.body);
  check(
    "drafting needs the pool creator",
    (await call(`${rulesUrl}/draft`, { json: {} })).status === 401 &&
      (await call(`${rulesUrl}/draft`, { json: {}, headers: await bearer(stranger) })).status === 403,
  );
  const drafted = await call(`${rulesUrl}/draft`, { json: { about: "A demo", focus: "memory safety" }, headers: auth });
  const draftRules = drafted.body.rules as typeof CANNED_RULES;
  check("the setup agent returns a draft", drafted.status === 200 && draftRules?.severity?.length === 4, drafted.body);
  check("the creator sees the saved draft", ((await call(rulesUrl, { headers: auth })).body.draft as { summary?: string })?.summary === CANNED_RULES.summary);
  check("the public never sees a draft", !("draft" in (await call(rulesUrl)).body));
  check("saving rules with missing fields is refused", (await call(rulesUrl, { method: "PUT", body: JSON.stringify({ rules: { summary: "x" } }), headers: auth })).status === 400);
  const edited = { ...draftRules, summary: "Edited by the maintainer." };
  check("the creator saves an edited draft", (await call(rulesUrl, { method: "PUT", body: JSON.stringify({ rules: edited }), headers: auth })).status === 200);
  check("a stranger cannot publish", (await call(`${rulesUrl}/publish`, { json: {}, headers: await bearer(stranger) })).status === 403);
  const pub = await call(`${rulesUrl}/publish`, { json: {}, headers: auth });
  const md = String(pub.body.securityMd ?? "");
  check(
    "publish creates version 1 with a SECURITY.md",
    pub.body.version === 1 && md.includes("Edited by the maintainer.") && md.includes(`/pool/${poolId}`) && md.includes("5.00 USDC"),
    pub.body,
  );
  check(
    "publish links to GitHub's editor on the default branch",
    String(pub.body.commitUrl).startsWith(`https://github.com/${REPO}/new/main?filename=SECURITY.md`),
    pub.body.commitUrl,
  );
  const r1 = await call(rulesUrl);
  check("the published rules are public", (r1.body.published as { version: number })?.version === 1, r1.body);
  const mdRes = await fetch(`${BASE}/api/pools/${poolId}/security-md`);
  check(
    "SECURITY.md is served as markdown",
    mdRes.status === 200 && (mdRes.headers.get("content-type") ?? "").includes("markdown") && (await mdRes.text()).includes("# Security Policy"),
  );
  const badge = await fetch(`${BASE}/api/badge/${poolId}`);
  const svg = await badge.text();
  check("the badge is an SVG with the bounty and deposit", badge.status === 200 && svg.includes("<svg") && svg.includes("bug bounty") && svg.includes("deposit 5.00"), svg.slice(0, 120));

  const triageUrl = (id: string) => `/api/github/reports/${id}/triage?pool=${poolId}`;
  check("AI review needs the pool creator", (await call(triageUrl(B), { json: {}, headers: await bearer(stranger) })).status === 403);
  check("AI review of an unknown report -> 404", (await call(triageUrl("GHSA-9999-9999-9999"), { json: {}, headers: auth })).status === 404);
  const tri = await call(triageUrl(B), { json: {}, headers: auth });
  const run = tri.body.run as {
    error?: string;
    rulesVersion: number;
    grounding: { missingShare: number | null };
    recommendation: { verdict: string; needsHuman: boolean; suggestedBountyPercent: number } | null;
  };
  check(
    "AI review returns a recommendation judged against version 1",
    tri.status === 200 && !run?.error && run?.rulesVersion === 1 && run?.recommendation?.verdict === "valid",
    tri.body,
  );
  check("grounding ran against the repository (cited file and line exist)", run?.grounding?.missingShare === 0, run?.grounding);
  check(
    "a valid recommendation needs the maintainer and suggests the table's share",
    run?.recommendation?.needsHuman === true && run?.recommendation?.suggestedBountyPercent === 50,
    run?.recommendation,
  );
  const steps = (tri.body.run as { investigation?: { steps: { tool: string; ok: boolean }[] } })?.investigation?.steps ?? [];
  check("the reviewer read the cited file with its tools", steps.some((x) => x.tool === "read_file" && x.ok), steps);
  check("a review playbook was chosen for the report", steps[0]?.tool === "load_skill" && steps[0].ok, steps);
  check(
    "both reviewers were called once each",
    modelCalls.filter((c) => c === "triage").length === 1 && modelCalls.filter((c) => c === "triage_review").length === 1,
    modelCalls,
  );
  const withTriage = ((await call(`/api/github/reports?pool=${poolId}`, { headers: auth })).body.reports ?? []) as { ghsa: string; triage: unknown }[];
  check(
    "the report list carries the latest review",
    withTriage.find((x) => x.ghsa === B)?.triage !== null && withTriage.find((x) => x.ghsa === A)?.triage === null,
    withTriage.map((x) => [x.ghsa, Boolean(x.triage)]),
  );

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
