// GitHub sends the owner back here after they confirm creating the app.
// The credentials are saved for the site to use straight away: in .env locally, encrypted in the
// database on a deployed site. Only if neither is possible are they shown once to copy by hand.
import { githubConfigured } from "@/lib/server/github";
import { canStoreGithubApp, hydrateGithubApp, saveGithubApp } from "@/lib/server/githubAppStore";
import { takeState } from "@/lib/server/githubSession";
import { canWriteEnvFile, convertManifest, saveToEnvFile } from "@/lib/server/githubSetup";

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ENTITIES[c]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(new URL(`/setup/github?${q}`, url.origin), 302);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expected = await takeState();
  // The state cookie is only issued to someone who passed the setup check (see the manifest route).
  if (!code || !state || state !== expected) return back("error=expired");
  await hydrateGithubApp();
  if (githubConfigured()) return back("error=configured");

  let result;
  try {
    result = await convertManifest(code);
  } catch (e) {
    console.error("[github setup]", e);
    return back("error=failed");
  }

  const slug = encodeURIComponent(result.creds.GITHUB_APP_SLUG);
  if (canStoreGithubApp()) {
    try {
      await saveGithubApp(result.creds);
      return back(`done=1&saved=db&slug=${slug}`);
    } catch (e) {
      // Fall through to showing the values, so the new app isn't lost.
      console.error("[github setup] couldn't save the app:", e);
    }
  } else if (canWriteEnvFile) {
    saveToEnvFile(result.creds);
    return back(`done=1&saved=env&slug=${slug}`);
  }

  const rows = Object.entries(result.creds)
    .map(
      ([k, v]) =>
        `<tr><th>${k}</th><td><textarea readonly rows="${k.endsWith("KEY") ? 6 : 1}">${esc(v)}</textarea></td></tr>`,
    )
    .join("");
  const html = `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex">
<title>ReportBond GitHub App created</title>
<style>
body{font:15px system-ui;max-width:760px;margin:40px auto;padding:0 16px}
th{text-align:left;vertical-align:top;padding:6px 12px 6px 0;font:13px ui-monospace,monospace}
td{width:100%}textarea{width:100%;font:12px ui-monospace,monospace}
.warn{background:#fef3c7;color:#111;padding:12px;border-radius:8px}
</style>
<h1>GitHub App created</h1>
<p class="warn"><strong>This site couldn't save the app's credentials itself, so they are shown once here.</strong>
Add each one to your host's environment variables (Vercel: Project → Settings → Environment Variables), then redeploy.
Do not share or commit them.</p>
<table>${rows}</table>
<p>App page: <a href="${esc(result.htmlUrl)}">${esc(result.htmlUrl)}</a></p>
<p>After redeploying, remove <code>SETUP_SECRET</code>, then open <a href="/maintainer">/maintainer</a> and connect GitHub.</p>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
