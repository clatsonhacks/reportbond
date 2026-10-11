// Where a deployed site keeps its GitHub App's credentials: encrypted, in the site's own database.
// Setup saves them here and the site uses them at once, so nobody copies secrets into the host's
// settings or redeploys. Environment variables, when set, always win (local development uses .env).
import "server-only";
import "./env";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { loadGithubAppRecord, saveGithubAppRecord } from "./db";
import { githubConfigured } from "./github";
import type { AppCredentials } from "./githubSetup";

/** "db" on a deployed site, "env-file" in development. GITHUB_APP_STORE overrides it. */
export const githubAppStore: "db" | "env-file" =
  process.env.GITHUB_APP_STORE === "db" || process.env.GITHUB_APP_STORE === "env-file"
    ? process.env.GITHUB_APP_STORE
    : process.env.NODE_ENV === "production"
      ? "db"
      : "env-file";

// The credentials are encrypted with a key derived from a secret the server already has, so a copy
// of the database alone doesn't reveal them.
function key(): Buffer | null {
  const secret = process.env.APP_SECRET || process.env.RELAYER_PRIVATE_KEY || process.env.CRON_SECRET;
  return secret ? createHash("sha256").update(`reportbond-github-app:${secret}`).digest() : null;
}

export const canStoreGithubApp = () => githubAppStore === "db" && key() !== null;

function apply(creds: AppCredentials) {
  for (const [k, v] of Object.entries(creds)) process.env[k] = v;
}

export async function saveGithubApp(creds: AppCredentials): Promise<void> {
  const k = key();
  if (!k) throw new Error("No server secret to encrypt the GitHub App credentials with");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(creds), "utf8"), cipher.final()]);
  await saveGithubAppRecord({
    slug: creds.GITHUB_APP_SLUG,
    savedAt: Math.floor(Date.now() / 1000),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  });
  apply(creds);
}

const state = globalThis as { __rbGithubAppChecked?: number };
const RECHECK_MS = 15_000;

/**
 * Make the saved app's credentials available to this server process. Cheap to call often: it does
 * nothing once an app is configured, and otherwise looks in the database at most every 15 seconds
 * (so a server that started before setup picks the app up without a restart).
 */
export async function hydrateGithubApp(): Promise<void> {
  if (githubAppStore !== "db" || githubConfigured()) return;
  if (Date.now() - (state.__rbGithubAppChecked ?? 0) < RECHECK_MS) return;
  state.__rbGithubAppChecked = Date.now();
  const k = key();
  if (!k) return;
  try {
    const record = await loadGithubAppRecord();
    if (!record) return;
    const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(record.iv, "base64"));
    decipher.setAuthTag(Buffer.from(record.tag, "base64"));
    const json = Buffer.concat([decipher.update(Buffer.from(record.data, "base64")), decipher.final()]).toString("utf8");
    apply(JSON.parse(json) as AppCredentials);
  } catch (e) {
    console.error("[github app] couldn't load the saved app:", (e as Error).message);
  }
}
