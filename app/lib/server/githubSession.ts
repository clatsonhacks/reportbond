// Maintainer GitHub sessions: a random ID in an httpOnly cookie, the data server-side.
import "server-only";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { loadGithub, updateGithub, type GithubRepo } from "./db";

export const SESSION_COOKIE = "rb_gh";
export const STATE_COOKIE = "rb_gh_state";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export const newToken = () => randomBytes(24).toString("base64url");

export async function createSession(login: string, repos: GithubRepo[]): Promise<void> {
  const sid = newToken();
  const now = Date.now();
  await updateGithub((d) => {
    for (const [k, s] of Object.entries(d.sessions)) if (s.expiresAt < now) delete d.sessions[k];
    d.sessions[sid] = { login, repos, expiresAt: now + SESSION_TTL_MS };
  });
  (await cookies()).set(SESSION_COOKIE, sid, { ...cookieOptions, maxAge: SESSION_TTL_MS / 1000 });
}

export async function currentSession(): Promise<{ login: string; repos: GithubRepo[] } | null> {
  const sid = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!sid) return null;
  const s = (await loadGithub()).sessions[sid];
  return s && s.expiresAt > Date.now() ? { login: s.login, repos: s.repos } : null;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const sid = jar.get(SESSION_COOKIE)?.value;
  if (sid) await updateGithub((d) => void delete d.sessions[sid]);
  jar.delete(SESSION_COOKIE);
}

export async function setState(state: string): Promise<void> {
  (await cookies()).set(STATE_COOKIE, state, { ...cookieOptions, maxAge: 600 });
}

export async function takeState(): Promise<string | undefined> {
  const jar = await cookies();
  const v = jar.get(STATE_COOKIE)?.value;
  jar.delete(STATE_COOKIE);
  return v;
}
