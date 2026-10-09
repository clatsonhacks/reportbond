// GitHub App webhook: installations, and private vulnerability reports as they're filed.
// Configure the app to send installation, installation_repositories and repository_advisory events here.
import { updateGithub, type GithubRepo } from "@/lib/server/db";
import { githubConfigured, verifyWebhookSignature } from "@/lib/server/github";
import { trackedFromWebhook } from "@/lib/server/tracker";
import { bad, json } from "@/lib/server/views";

type Repo = { id: number; full_name: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = any;

export async function POST(req: Request) {
  if (!githubConfigured()) return bad("GitHub isn't configured", 503);
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) return bad("Bad signature", 401);

  const event = req.headers.get("x-github-event") ?? "";
  const delivery = req.headers.get("x-github-delivery") ?? "";
  const p: Payload = JSON.parse(raw);
  let applied = false;

  await updateGithub((d) => {
    // GitHub can redeliver; apply each delivery once.
    if (delivery && d.deliveries.includes(delivery)) return;
    if (delivery) d.deliveries = [...d.deliveries.slice(-499), delivery];
    applied = true;

    const installId = p.installation?.id as number | undefined;
    const toRepo = (r: Repo): GithubRepo => ({ id: r.id, fullName: r.full_name.toLowerCase(), installationId: installId! });

    if (event === "installation" && installId) {
      if (p.action === "deleted") {
        delete d.installations[installId];
      } else {
        const repos: Record<string, GithubRepo> = {};
        for (const r of (p.repositories ?? []) as Repo[]) repos[r.full_name.toLowerCase()] = toRepo(r);
        d.installations[installId] = { account: String(p.installation.account?.login ?? "").toLowerCase(), repos, updatedAt: Date.now() };
      }
    }

    if (event === "installation_repositories" && installId) {
      const inst = (d.installations[installId] ??= {
        account: String(p.installation.account?.login ?? "").toLowerCase(),
        repos: {},
        updatedAt: Date.now(),
      });
      for (const r of (p.repositories_added ?? []) as Repo[]) inst.repos[r.full_name.toLowerCase()] = toRepo(r);
      for (const r of (p.repositories_removed ?? []) as Repo[]) delete inst.repos[r.full_name.toLowerCase()];
      inst.updatedAt = Date.now();
    }

    if (event === "repository_advisory" && p.repository_advisory && p.repository?.full_name) {
      const t = trackedFromWebhook(p.repository_advisory, p.repository.full_name, p.sender?.login ?? null);
      if (t) {
        const prev = d.advisories[t.ghsa];
        // Keep the original report time and sync state; refresh GitHub's state.
        d.advisories[t.ghsa] = prev
          ? { ...prev, githubState: t.githubState, updatedAt: t.updatedAt, reporter: prev.reporter ?? t.reporter }
          : t;
      }
    }
  });

  return json({ ok: true, event, applied });
}
