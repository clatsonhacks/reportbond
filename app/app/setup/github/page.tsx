"use client";

// One-time setup for whoever runs this ReportBond site: creates the GitHub App with every setting pre-filled.
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";
import { Button, ButtonLink, Card, Loading, Notice } from "@/components/ui";
import { api, post } from "@/lib/api";

type SetupStatus = { configured: boolean; needsSecret: boolean; slug: string | null; reason: string | null; store: "db" | "env-file" };

const errors: Record<string, string> = {
  expired: "That setup link expired or was opened in a different browser. Please start again.",
  configured: "A GitHub App is already configured on this server.",
  failed: "GitHub did not return the app's credentials. Please start again.",
};

export default function SetupGithubPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SetupGithub />
    </Suspense>
  );
}

function SetupGithub() {
  const params = useSearchParams();
  const status = useQuery({ queryKey: ["github-setup"], queryFn: () => api<SetupStatus>("/api/github/setup/manifest") });
  const formRef = useRef<HTMLFormElement>(null);
  const manifestRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("ReportBond");
  const [organization, setOrganization] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLocal = typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
  const done = params.get("done");
  const failed = params.get("error");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await post<{ action: string; manifest: string }>("/api/github/setup/manifest", {
        name,
        organization,
        webhookUrl,
        secret,
      });
      // GitHub takes the manifest as a form post from the browser.
      formRef.current!.action = res.action;
      manifestRef.current!.value = res.manifest;
      formRef.current!.submit();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (status.isLoading) return <Loading />;
  const s = status.data;
  const field = "w-full rounded-2xl border border-line bg-surface px-3 py-2 text-sm";

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="geometric-bg px-6 sm:px-12 py-8">
        <div className="relative z-10 mx-auto max-w-[1600px]">
          <h1 className="text-3xl font-black tracking-tight">Set up the GitHub App</h1>
          <p className="mt-1 text-ink-muted">
            A one-time step for whoever runs this ReportBond site. After this, maintainers just click Connect GitHub.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-6 sm:px-12 py-8 space-y-6">

      {done && (
        <Notice tone="returned">
          GitHub App created{params.get("slug") ? ` (${params.get("slug")})` : ""}.{" "}
          {params.get("saved") === "db" ? (
            <>This site saved its credentials and is using them now. There is nothing to copy and nothing to redeploy.</>
          ) : (
            <>
              Its credentials were saved to <span className="num">.env</span>. Restart the dev server if Connect GitHub
              doesn&apos;t appear on the maintainer page.
            </>
          )}
        </Notice>
      )}
      {failed && <Notice tone="slashed">{errors[failed] ?? "Setup failed. Please start again."}</Notice>}

      {s?.configured ? (
        <Card className="space-y-3">
          <p>
            A GitHub App is configured on this server{s.slug ? <> (<span className="num">{s.slug}</span>)</> : null}.
          </p>
          <ButtonLink href="/maintainer">Go to the maintainer console</ButtonLink>
        </Card>
      ) : (
        <Card>
          <form onSubmit={create} className="space-y-4">
            <label className="block space-y-1">
              <span className="text-sm font-medium">App name</span>
              <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={34} required />
              <span className="block text-xs text-ink-muted">
                Shown to maintainers on GitHub&apos;s permission screen. It must be unique across GitHub, so add
                &quot;Testnet&quot; or your project name if it&apos;s taken.
              </span>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Organisation (optional)</span>
              <input className={`${field} num`} value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="leave empty to create it under your own account" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Public webhook URL (optional)</span>
              <input className={`${field} num`} value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} placeholder="https://smee.io/your-channel" />
              <span className="block text-xs text-ink-muted">
                {isLocal
                  ? "GitHub can't reach localhost. Leave empty to create the app without a webhook (Connect GitHub and verified pools still work), or paste a tunnel URL to track new reports."
                  : "Leave empty to use this site's own webhook address."}
              </span>
            </label>
            {s?.needsSecret && (
              <label className="block space-y-1">
                <span className="text-sm font-medium">Setup secret</span>
                <input className={`${field} num`} type="password" value={secret} onChange={(e) => setSecret(e.target.value)} required />
                <span className="block text-xs text-ink-muted">
                  The value of <span className="num">SETUP_SECRET</span> in this site&apos;s environment variables. It stops
                  anyone else from attaching their own GitHub App to this site.
                </span>
              </label>
            )}

            <div className="rounded-2xl border border-line bg-surface p-3 text-sm text-ink-muted">
              <p className="font-medium text-ink">The app will ask repositories for:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                <li>Security advisories: read and write (track private reports; accept or close them)</li>
                <li>Contents: read (for triage agents to check reports against the code)</li>
                <li>Pull requests: read and write (to propose a SECURITY.md)</li>
                <li>Metadata: read (required by GitHub)</li>
              </ul>
            </div>

            {error && <Notice tone="slashed">{error}</Notice>}
            <Button type="submit" disabled={busy}>
              {busy ? "Opening GitHub…" : "Create ReportBond GitHub App"}
            </Button>
            <p className="text-xs text-ink-muted">
              GitHub will show these settings for you to confirm. Nothing is created until you click Create there.
              {s?.store === "db" && " When you come back, this site saves the app's credentials itself: there is nothing to copy."}
            </p>
          </form>
        </Card>
      )}
      </div>

      {/* Posted to GitHub by create(). */}
      <form ref={formRef} method="post" className="hidden">
        <input ref={manifestRef} type="hidden" name="manifest" />
      </form>
    </div>
  );
}
