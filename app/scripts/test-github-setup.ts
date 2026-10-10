// Tests the one-click GitHub App setup (/setup/github) against a mock GitHub. No chain needed.
// Start the app with NO GitHub credentials, pointed at the mock, writing to a scratch env file:
//   GITHUB_API_URL=http://127.0.0.1:4010 GITHUB_WEB_URL=http://127.0.0.1:4010 SETUP_ENV_FILE=/tmp/rb-setup.env pnpm dev
// Then, with the same SETUP_ENV_FILE: pnpm test:github-setup
import { generateKeyPairSync } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const MOCK_PORT = 4010;
const ENV_FILE = process.env.SETUP_ENV_FILE;

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

const pem = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs1", format: "pem" }) as string;
const conversions: string[] = [];

const mock = createServer((req, res) => {
  const m = req.url?.match(/^\/app-manifests\/([^/]+)\/conversions$/);
  res.setHeader("content-type", "application/json");
  if (req.method === "POST" && m) {
    conversions.push(m[1]);
    if (m[1] !== "good-code") {
      res.statusCode = 404;
      return res.end(JSON.stringify({ message: "Not Found" }));
    }
    res.statusCode = 201;
    return res.end(
      JSON.stringify({
        id: 987654,
        slug: "reportbond-setup-test",
        client_id: "Iv1.setuptest",
        client_secret: "setup-client-secret",
        webhook_secret: "setup-webhook-secret",
        pem,
        html_url: "https://github.com/apps/reportbond-setup-test",
      }),
    );
  }
  res.statusCode = 404;
  res.end(JSON.stringify({ message: "mock: no route" }));
});

async function call(path: string, init: RequestInit & { json?: unknown; cookie?: string } = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    redirect: "manual",
    method: init.json !== undefined ? "POST" : init.method,
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    headers: { "content-type": "application/json", ...(init.cookie ? { cookie: init.cookie } : {}) },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {}
  return { status: res.status, body, headers: res.headers, location: res.headers.get("location") ?? "" };
}

const stateCookie = (h: Headers) =>
  h
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("rb_gh_state=") && c.length > 12);

async function main() {
  if (!ENV_FILE) throw new Error("Set SETUP_ENV_FILE to a scratch file (the same one the app was started with)");
  rmSync(ENV_FILE, { force: true });
  await new Promise<void>((r) => mock.listen(MOCK_PORT, "127.0.0.1", r));

  const s0 = await call("/api/github/setup/manifest");
  check("setup is available: nothing configured, no secret needed locally", s0.body.configured === false && s0.body.needsSecret === false, s0.body);

  check("app name over 34 characters is refused", (await call("/api/github/setup/manifest", { json: { name: "x".repeat(35) } })).status === 400);
  check("non-https webhook URL is refused", (await call("/api/github/setup/manifest", { json: { webhookUrl: "http://example.com/hook" } })).status === 400);

  const m1 = await call("/api/github/setup/manifest", { json: { name: "ReportBond Test" } });
  const manifest = JSON.parse(String(m1.body.manifest ?? "{}"));
  check("form posts to the user's new-app page with a state", String(m1.body.action).includes("/settings/apps/new?state="), m1.body.action);
  check(
    "manifest asks for the right permissions and events",
    manifest.default_permissions?.repository_advisories === "write" &&
      manifest.default_permissions?.contents === "read" &&
      manifest.default_permissions?.metadata === "read" &&
      manifest.default_events?.includes("repository_advisory") &&
      manifest.request_oauth_on_install === true,
    manifest,
  );
  check(
    "manifest points GitHub back at this site",
    manifest.redirect_url === `${BASE}/api/github/setup/callback` && manifest.callback_urls?.[0] === `${BASE}/api/github/callback`,
    manifest,
  );
  check("on localhost without a tunnel, webhooks are created off", manifest.hook_attributes?.active === false, manifest.hook_attributes);

  const m2 = await call("/api/github/setup/manifest", { json: { organization: "my-org", webhookUrl: "https://smee.io/abc" } });
  const manifest2 = JSON.parse(String(m2.body.manifest ?? "{}"));
  check("organisation apps post to the organisation's page", String(m2.body.action).includes("/organizations/my-org/settings/apps/new"), m2.body.action);
  check("a tunnel URL turns webhooks on", manifest2.hook_attributes?.active === true && manifest2.hook_attributes?.url === "https://smee.io/abc", manifest2.hook_attributes);

  const forged = await call("/api/github/setup/callback?code=good-code&state=forged", { cookie: stateCookie(m2.headers) });
  check("callback with a forged state is refused, no code exchanged", forged.location.includes("error=expired") && conversions.length === 0, forged.location);

  const m3 = await call("/api/github/setup/manifest", { json: {} });
  const state3 = new URL(String(m3.body.action)).searchParams.get("state")!;
  const badCode = await call(`/api/github/setup/callback?code=bad-code&state=${state3}`, { cookie: stateCookie(m3.headers) });
  check("a code GitHub rejects reports failure", badCode.location.includes("error=failed"), badCode.location);
  check("nothing saved after a failed exchange", !existsSync(ENV_FILE));

  const m4 = await call("/api/github/setup/manifest", { json: {} });
  const state4 = new URL(String(m4.body.action)).searchParams.get("state")!;
  const ok = await call(`/api/github/setup/callback?code=good-code&state=${state4}`, { cookie: stateCookie(m4.headers) });
  check("callback saves the app and returns to the setup page", ok.location.includes("done=1") && ok.location.includes("slug=reportbond-setup-test"), ok.location);

  const saved = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const value = (k: string) => saved.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1];
  check(
    "all six credentials written to the env file",
    value("GITHUB_APP_ID") === "987654" &&
      value("GITHUB_APP_SLUG") === "reportbond-setup-test" &&
      value("GITHUB_CLIENT_ID") === "Iv1.setuptest" &&
      value("GITHUB_CLIENT_SECRET") === "setup-client-secret" &&
      value("GITHUB_WEBHOOK_SECRET") === "setup-webhook-secret" &&
      Boolean(value("GITHUB_APP_PRIVATE_KEY")),
    saved.replace(/PRIVATE_KEY=.*/, "PRIVATE_KEY=<hidden>"),
  );
  const key = value("GITHUB_APP_PRIVATE_KEY") ?? "";
  check("private key stored on one line and restorable", key.replace(/\\n/g, "\n").trim() === pem.trim(), key.slice(0, 40));

  const s1 = await call("/api/github/setup/manifest");
  check("setup now reports the app as configured", s1.body.configured === true && s1.body.slug === "reportbond-setup-test", s1.body);
  check("setup can't be run again over an existing app", (await call("/api/github/setup/manifest", { json: {} })).status === 409);
  const session = await call("/api/github/session");
  check("Connect GitHub is live without a restart", session.body.configured === true, session.body);

  mock.close();
  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  mock.close();
  process.exit(1);
});
