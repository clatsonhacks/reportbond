// GET tells the setup page whether setup is available; POST returns the pre-filled app definition
// for the page to send to GitHub.
import { newToken, setState } from "@/lib/server/githubSession";
import { buildManifest, manifestAction, setupAccess } from "@/lib/server/githubSetup";
import { bad, json } from "@/lib/server/views";

export async function GET() {
  const access = setupAccess(null);
  return json({
    configured: !access.allowed && !access.needsSecret,
    needsSecret: access.needsSecret,
    slug: process.env.GITHUB_APP_SLUG ?? null,
    reason: access.reason ?? null,
  });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as {
    name?: string;
    webhookUrl?: string;
    organization?: string;
    secret?: string;
  };
  const access = setupAccess(b.secret ?? null);
  if (!access.allowed) return bad(access.reason ?? "Setup is not available", access.needsSecret ? 401 : 409);

  const name = b.name?.trim() || "ReportBond";
  if (name.length > 34) return bad("GitHub App names can be at most 34 characters");
  if (b.webhookUrl?.trim() && !/^https:\/\//.test(b.webhookUrl.trim())) return bad("The webhook URL must start with https://");

  const state = newToken();
  await setState(state);
  const manifest = buildManifest({ name, appUrl: new URL(req.url).origin, webhookUrl: b.webhookUrl });
  return json({
    action: manifestAction(state, b.organization),
    manifest: JSON.stringify(manifest),
    webhooksActive: manifest.hook_attributes.active,
  });
}
