// One-click creation of the ReportBond GitHub App through GitHub's manifest flow:
// we send GitHub a pre-filled app definition, the owner confirms, and GitHub hands back the credentials.
import "server-only";
import "./env";
import { timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { githubConfigured } from "./github";

const API = () => (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
const WEB = () => (process.env.GITHUB_WEB_URL ?? "https://github.com").replace(/\/$/, "");
const isProd = process.env.NODE_ENV === "production";

export type SetupAccess = { allowed: boolean; reason?: string; needsSecret: boolean };

/**
 * Whoever runs setup decides which GitHub App this server trusts, so:
 * never when an app is already configured; open locally; on a deployed site only with SETUP_SECRET.
 */
export function setupAccess(secret: string | null): SetupAccess {
  if (githubConfigured()) {
    return { allowed: false, needsSecret: false, reason: "A GitHub App is already configured on this server." };
  }
  if (!isProd) return { allowed: true, needsSecret: false };
  const expected = process.env.SETUP_SECRET;
  if (!expected) {
    return { allowed: false, needsSecret: true, reason: "Set SETUP_SECRET in the host's environment variables to enable setup." };
  }
  const a = Buffer.from(secret ?? "");
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);
  return { allowed: ok, needsSecret: true, reason: ok ? undefined : "Enter the setup secret." };
}

export type ManifestOptions = { name: string; appUrl: string; webhookUrl?: string };

/** The app definition GitHub pre-fills. Keep in step with GITHUB_APP.md. */
export function buildManifest(o: ManifestOptions) {
  const appUrl = o.appUrl.replace(/\/$/, "");
  const local = /\/\/(localhost|127\.0\.0\.1)/.test(appUrl);
  const customHook = o.webhookUrl?.trim();
  return {
    name: o.name,
    url: appUrl,
    description:
      "Refundable USDC deposits for private security reports. Verifies maintainers and tracks private vulnerability reports.",
    // GitHub can't deliver to localhost; without a public webhook URL the app is created with webhooks off.
    hook_attributes: { url: customHook || `${appUrl}/api/github/webhook`, active: !(local && !customHook) },
    redirect_url: `${appUrl}/api/github/setup/callback`,
    callback_urls: [`${appUrl}/api/github/callback`],
    public: true,
    request_oauth_on_install: true,
    default_permissions: {
      metadata: "read",
      repository_advisories: "write",
      contents: "read",
      pull_requests: "write",
    },
    default_events: ["repository_advisory"],
  };
}

/** Where the browser posts the manifest: the user's account, or an organisation they own. */
export function manifestAction(state: string, organization?: string): string {
  const org = organization?.trim();
  const base = org ? `${WEB()}/organizations/${encodeURIComponent(org)}/settings/apps/new` : `${WEB()}/settings/apps/new`;
  return `${base}?state=${encodeURIComponent(state)}`;
}

export type AppCredentials = {
  GITHUB_APP_ID: string;
  GITHUB_APP_SLUG: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  GITHUB_WEBHOOK_SECRET: string;
  GITHUB_APP_PRIVATE_KEY: string;
};

/** Exchange the one-time code GitHub sends back for the new app's credentials. */
export async function convertManifest(code: string): Promise<{ creds: AppCredentials; htmlUrl: string }> {
  const res = await fetch(`${API()}/app-manifests/${encodeURIComponent(code)}/conversions`, {
    method: "POST",
    headers: { accept: "application/vnd.github+json", "user-agent": "ReportBond" },
  });
  const b = await res.json().catch(() => ({}));
  if (!res.ok || !b.id || !b.pem) throw new Error(`GitHub returned no app credentials (${res.status} ${b.message ?? ""})`);
  return {
    htmlUrl: String(b.html_url ?? ""),
    creds: {
      GITHUB_APP_ID: String(b.id),
      GITHUB_APP_SLUG: String(b.slug),
      GITHUB_CLIENT_ID: String(b.client_id),
      GITHUB_CLIENT_SECRET: String(b.client_secret),
      GITHUB_WEBHOOK_SECRET: String(b.webhook_secret ?? ""),
      // One line, so it fits in .env; github.ts turns "\n" back into newlines.
      GITHUB_APP_PRIVATE_KEY: String(b.pem).trim().replace(/\r?\n/g, "\\n") + "\\n",
    },
  };
}

export const canWriteEnvFile = !isProd;

/** Local only: put the credentials in the repo-root .env (replacing old values) and use them right away. */
export function saveToEnvFile(creds: AppCredentials): string {
  const file = process.env.SETUP_ENV_FILE ?? path.resolve(process.cwd(), "..", ".env");
  const keys = new Set(Object.keys(creds));
  const kept = existsSync(file)
    ? readFileSync(file, "utf8")
        .split(/\r?\n/)
        .filter((line) => !keys.has(line.split("=")[0].trim()))
    : [];
  while (kept.length && kept[kept.length - 1].trim() === "") kept.pop();
  const block = [
    "",
    "# GitHub App, created by /setup/github. Never commit these.",
    ...Object.entries(creds).map(([k, v]) => `${k}=${v}`),
    "",
  ];
  writeFileSync(file, [...kept, ...block].join("\n"));
  for (const [k, v] of Object.entries(creds)) process.env[k] = v;
  return file;
}
