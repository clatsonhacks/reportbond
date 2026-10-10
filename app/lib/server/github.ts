// GitHub App client: app authentication, installation tokens, maintainer sign-in, webhook signatures.
// Configuration (see GITHUB_APP.md): GITHUB_APP_ID, GITHUB_APP_SLUG, GITHUB_APP_PRIVATE_KEY,
// GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_WEBHOOK_SECRET.
// GITHUB_API_URL and GITHUB_WEB_URL can point at a mock server for tests.
import "server-only";
import "./env";
import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import type { GithubRepo } from "./db";

const API = () => (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
const WEB = () => (process.env.GITHUB_WEB_URL ?? "https://github.com").replace(/\/$/, "");

export function githubConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID &&
      process.env.GITHUB_APP_SLUG &&
      process.env.GITHUB_APP_PRIVATE_KEY &&
      process.env.GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET &&
      process.env.GITHUB_WEBHOOK_SECRET,
  );
}

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see GITHUB_APP.md)`);
  return v;
}

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function gh<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path.startsWith("http") ? path : `${API()}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "ReportBond",
      authorization: `Bearer ${token}`,
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new GithubError(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${body.message ?? ""}`, res.status);
  return body as T;
}

// --------------------------------------------------------------- app identity

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Short-lived JWT that authenticates as the GitHub App itself (max 10 minutes). */
export function appJwt(now = Math.floor(Date.now() / 1000)): string {
  // Keys pasted into env settings often have literal "\n" instead of newlines.
  const key = need("GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n");
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: need("GITHUB_APP_ID") }));
  const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(key);
  return `${header}.${payload}.${b64url(signature)}`;
}

const g = globalThis as { __rbInstallationTokens?: Map<number, { token: string; expiresAt: number }> };
const tokenCache = (g.__rbInstallationTokens ??= new Map());

/** Token to act on one installation's repositories. Cached until shortly before it expires. */
export async function installationToken(installationId: number): Promise<string> {
  const hit = tokenCache.get(installationId);
  if (hit && hit.expiresAt - 300_000 > Date.now()) return hit.token;
  const res = await gh<{ token: string; expires_at: string }>(`/app/installations/${installationId}/access_tokens`, appJwt(), {
    method: "POST",
  });
  tokenCache.set(installationId, { token: res.token, expiresAt: Date.parse(res.expires_at) });
  return res.token;
}

// ------------------------------------------------------- maintainer sign-in

/** Where "Connect GitHub" sends the maintainer: install the app, or just sign in if it's installed. */
export function connectUrl(state: string, mode: "install" | "signin"): string {
  if (mode === "signin") {
    const q = new URLSearchParams({ client_id: need("GITHUB_CLIENT_ID"), state });
    return `${WEB()}/login/oauth/authorize?${q}`;
  }
  return `${WEB()}/apps/${need("GITHUB_APP_SLUG")}/installations/new?state=${encodeURIComponent(state)}`;
}

/** Exchange the sign-in code for a user token. */
export async function exchangeCode(code: string): Promise<string> {
  const res = await fetch(`${WEB()}/login/oauth/access_token`, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json", "user-agent": "ReportBond" },
    body: JSON.stringify({ client_id: need("GITHUB_CLIENT_ID"), client_secret: need("GITHUB_CLIENT_SECRET"), code }),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!body.access_token) throw new GithubError(body.error_description ?? "GitHub sign-in failed", 401);
  return body.access_token;
}

type RepoPayload = { id: number; full_name: string; permissions?: { admin?: boolean } };

/** The signed-in user's GitHub login and the repos where they are an admin and our app is installed. */
export async function adminRepos(userToken: string): Promise<{ login: string; repos: GithubRepo[] }> {
  const user = await gh<{ login: string }>("/user", userToken);
  const { installations } = await gh<{ installations: { id: number }[] }>("/user/installations?per_page=100", userToken);
  const repos: GithubRepo[] = [];
  for (const inst of installations) {
    for (let page = 1; page <= 10; page++) {
      const res = await gh<{ repositories: RepoPayload[] }>(
        `/user/installations/${inst.id}/repositories?per_page=100&page=${page}`,
        userToken,
      );
      for (const r of res.repositories) {
        if (r.permissions?.admin) repos.push({ id: r.id, fullName: r.full_name.toLowerCase(), installationId: inst.id });
      }
      if (res.repositories.length < 100) break;
    }
  }
  return { login: user.login.toLowerCase(), repos };
}

// ------------------------------------------------------------------ webhooks

/** Checks GitHub's X-Hub-Signature-256 header against the raw request body. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", need("GITHUB_WEBHOOK_SECRET")).update(rawBody).digest();
  const given = Buffer.from(signature.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// ------------------------------------------------------------------ advisories

/** Accept (draft) or reject (closed) a private vulnerability report on GitHub. */
export async function setAdvisoryState(
  installationId: number,
  repo: string,
  ghsa: string,
  state: "draft" | "closed",
): Promise<void> {
  const token = await installationToken(installationId);
  await gh(`/repos/${repo}/security-advisories/${ghsa}`, token, { method: "PATCH", body: JSON.stringify({ state }) });
}

// ------------------------------------------------------------------ repo reads

/** GET a repository-scoped API path as the installation (read access granted by the maintainer). */
export async function installationGet<T>(installationId: number, path: string, init: RequestInit = {}): Promise<T> {
  return gh<T>(path, await installationToken(installationId), init);
}
