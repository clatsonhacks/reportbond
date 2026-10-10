"use client";

// One place to sign in: GitHub (who you are), wallet (where money moves), and one signature linking the two.
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useAccount } from "wagmi";
import { GithubMark, GithubSignInButton } from "@/components/GithubConnect";
import { Button, ButtonLink, Card, Loading, Notice } from "@/components/ui";
import { api, post } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import { useGithubSession } from "@/lib/github";
import { savedSignInToken, useSignIn } from "@/lib/useSignIn";

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Login />
    </Suspense>
  );
}

function Step({ n, done, title, children }: { n: number; done: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 rounded-[8px] border border-line bg-card p-4">
      <span
        aria-hidden
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
          done ? "bg-returned-bg text-returned" : "bg-surface text-ink-muted"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-medium">
          {title}
          <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
        </p>
        {children}
      </div>
    </li>
  );
}

function Login() {
  const router = useRouter();
  const params = useSearchParams();
  // Only same-site paths are followed after sign-in.
  const raw = params.get("next");
  const next = raw && /^\/(?![/\\])/.test(raw) ? raw : null;

  const github = useGithubSession();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const signIn = useSignIn();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = savedSignInToken(address);
  const link = useQuery({
    queryKey: ["github-link", address?.toLowerCase() ?? null, Boolean(token)],
    queryFn: () => api<{ login: string | null }>("/api/github/link", { headers: { authorization: `Bearer ${token}` } }),
    enabled: Boolean(address && token),
  });

  if (github.isLoading) return <Loading />;
  const session = github.data;
  const hasGithub = Boolean(session?.connected);
  const linkedLogin = link.data?.login ?? null;
  const linked = hasGithub && linkedLogin === session?.login;
  const backHere = `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const t = await signIn();
      await post("/api/github/link", {}, { authorization: `Bearer ${t}` });
      await qc.invalidateQueries({ queryKey: ["github-link"] });
      if (next) router.push(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-1 text-ink-muted">
          Your GitHub account says who you are. Your wallet is where deposits and bounties move. Linking them takes one
          free signature.
        </p>
      </div>

      {session && !session.configured && (
        <Notice tone="waiting">
          GitHub sign-in isn&apos;t set up on this site yet. The site owner can set it up in one click from the button
          below. You can still connect a wallet and use the app without it.
        </Notice>
      )}

      <ol className="space-y-3">
        <Step n={1} done={hasGithub} title="GitHub">
          {hasGithub ? (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <GithubMark className="h-4 w-4" /> Signed in as <span className="font-medium text-ink">@{session!.login}</span>
            </p>
          ) : (
            <GithubSignInButton next={backHere} />
          )}
        </Step>

        <Step n={2} done={isConnected} title="Wallet">
          {isConnected && address ? (
            <p className="num text-sm text-ink-muted">Connected: {shortAddress(address)}</p>
          ) : (
            <Button onClick={openConnectModal}>Connect wallet</Button>
          )}
        </Step>

        <Step n={3} done={linked} title="Link them">
          {linked ? (
            <p className="text-sm text-ink-muted">
              This wallet is linked to <span className="font-medium text-ink">@{linkedLogin}</span>.
            </p>
          ) : hasGithub && isConnected ? (
            <>
              <p className="text-sm text-ink-muted">
                {linkedLogin
                  ? `This wallet is linked to @${linkedLogin}. Sign to link it to @${session!.login} instead.`
                  : "Sign one message with your wallet. It costs nothing and moves no money."}
              </p>
              <Button onClick={finish} disabled={busy}>
                {busy ? "Waiting for your wallet…" : `Link @${session!.login} to this wallet`}
              </Button>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Finish the two steps above first.</p>
          )}
        </Step>
      </ol>

      {error && <Notice tone="slashed">{error}</Notice>}

      <Card className="space-y-3">
        <p className="font-medium">{linked ? "You're signed in. What next?" : "Or carry on without signing in"}</p>
        <div className="flex flex-wrap gap-2">
          {next && <ButtonLink href={next}>Continue</ButtonLink>}
          <ButtonLink href="/maintainer" variant={next ? "secondary" : "primary"}>
            I maintain a project
          </ButtonLink>
          <ButtonLink href="/#pools" variant="secondary">
            I want to report a bug
          </ButtonLink>
        </div>
        {!linked && (
          <p className="text-xs text-ink-muted">
            Browsing needs nothing. Paying a deposit needs a wallet. Opening a verified pool needs GitHub and a wallet.
          </p>
        )}
      </Card>
    </div>
  );
}
