"use client";

// One place to sign in: GitHub (who you are) and wallet (where money moves). Once both are connected,
// the wallet is asked for one free signature that proves you own it and links it to the GitHub account.
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
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
  // The signature is asked for automatically once per wallet and account; after that only by the button.
  const asked = useRef<string | null>(null);

  const token = savedSignInToken(address);
  const link = useQuery({
    queryKey: ["github-link", address?.toLowerCase() ?? null, Boolean(token)],
    queryFn: () => api<{ login: string | null }>("/api/github/link", { headers: { authorization: `Bearer ${token}` } }),
    enabled: Boolean(address && token),
  });

  const session = github.data;
  const login = session?.connected ? session.login : null;
  const linkedLogin = link.data?.login ?? null;
  const linked = Boolean(login) && linkedLogin === login;
  const linkKnown = !token || link.isFetched;

  const confirm = useCallback(async () => {
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
  }, [signIn, qc, next, router]);

  // Both connected and not linked yet: ask the wallet to confirm, without a separate step.
  useEffect(() => {
    const who = login && address ? `${login}:${address}` : null;
    if (who && isConnected && linkKnown && !linked && !busy && asked.current !== who) {
      asked.current = who;
      void confirm();
    }
  }, [login, address, isConnected, linkKnown, linked, busy, confirm]);

  if (github.isLoading) return <Loading />;
  const backHere = `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  // With GitHub signed in, the wallet step is done once the wallet has confirmed it is yours.
  const walletDone = isConnected && (login ? linked : true);

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="geometric-bg px-6 sm:px-12 py-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-3xl font-black tracking-tight">Sign in</h1>
          <p className="mt-1 text-ink-muted">Your GitHub account says who you are. Your wallet is where deposits and bounties move.</p>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-6 sm:px-12 py-8 space-y-6">

      {session && !session.configured && (
        <Notice tone="waiting">
          GitHub sign-in isn&apos;t set up on this site yet. The site owner can set it up in one click from the button
          below. You can still connect a wallet and use the app without it.
        </Notice>
      )}

      <ol className="space-y-3">
        <Step n={1} done={Boolean(login)} title="GitHub">
          {login ? (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <GithubMark className="h-4 w-4" /> Signed in as <span className="font-medium text-ink">@{login}</span>
            </p>
          ) : (
            <GithubSignInButton next={backHere} />
          )}
        </Step>

        <Step n={2} done={walletDone} title="Wallet">
          {!isConnected || !address ? (
            <Button onClick={openConnectModal}>Connect wallet</Button>
          ) : !login ? (
            <p className="num text-sm text-ink-muted">Connected: {shortAddress(address)}</p>
          ) : linked ? (
            <p className="text-sm text-ink-muted">
              <span className="num">{shortAddress(address)}</span> is confirmed as yours and linked to{" "}
              <span className="font-medium text-ink">@{login}</span>.
            </p>
          ) : (
            <>
              <p className="text-sm text-ink-muted">
                <span className="num">{shortAddress(address)}</span> is connected.{" "}
                {busy
                  ? "Confirm the message in your wallet: it proves the wallet is yours. It costs nothing and moves no money."
                  : linkedLogin
                    ? `It's linked to @${linkedLogin}. Confirm to link it to @${login} instead.`
                    : "One more confirmation in your wallet proves it's yours. It costs nothing and moves no money."}
              </p>
              {!busy && <Button onClick={confirm}>Confirm in wallet</Button>}
            </>
          )}
        </Step>
      </ol>

      {error && <Notice tone="slashed">{error}</Notice>}

      <Card className="space-y-3">
        <p className="font-medium">{login && walletDone ? "You're signed in. What next?" : "Or carry on without signing in"}</p>
        <div className="flex flex-wrap gap-2">
          {next && <ButtonLink href={next}>Continue</ButtonLink>}
          <ButtonLink href="/maintainer" variant={next ? "secondary" : "primary"}>
            I maintain a project
          </ButtonLink>
          <ButtonLink href="/#pools" variant="secondary">
            I want to report a bug
          </ButtonLink>
        </div>
        {!(login && walletDone) && (
          <p className="text-xs text-ink-muted">
            Browsing needs nothing. Paying a deposit needs a wallet. Opening a verified pool needs GitHub and a wallet.
          </p>
        )}
      </Card>
      </div>
    </div>
  );
}
