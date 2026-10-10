"use client";

// For reporters: link your GitHub account to your wallet, so the maintainer can see that the person
// who paid a report's deposit is the person who filed it on GitHub. Optional, but it builds trust.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAccount } from "wagmi";
import { api, post } from "@/lib/api";
import { useGithubSession } from "@/lib/github";
import { useSignIn } from "@/lib/useSignIn";
import { GithubMark, GithubSignInButton } from "./GithubConnect";
import { Button, Notice } from "./ui";

type Link = { login: string | null };
const tokenKey = (address: string) => `reportbond.signin.${address.toLowerCase()}`;

/** The saved wallet sign-in token, if there is one: lets us show the link without asking for a signature. */
function savedToken(address: string | undefined): string | null {
  if (!address) return null;
  try {
    return JSON.parse(localStorage.getItem(tokenKey(address)) ?? "null")?.token ?? null;
  } catch {
    return null;
  }
}

export function GithubIdentity() {
  const pathname = usePathname();
  const { address } = useAccount();
  const github = useGithubSession();
  const signIn = useSignIn();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = savedToken(address);
  const link = useQuery({
    queryKey: ["github-link", address?.toLowerCase() ?? null, Boolean(token)],
    queryFn: () => api<Link>("/api/github/link", { headers: { authorization: `Bearer ${token}` } }),
    enabled: Boolean(address && token),
  });

  const session = github.data;
  if (!session?.configured || !address) return null;
  const linked = link.data?.login ?? null;

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const t = await signIn();
      await post("/api/github/link", {}, { authorization: `Bearer ${t}` });
      qc.invalidateQueries({ queryKey: ["github-link"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    setError(null);
    try {
      const t = await signIn();
      await api("/api/github/link", { method: "DELETE", headers: { authorization: `Bearer ${t}` } });
      qc.invalidateQueries({ queryKey: ["github-link"] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 rounded-[8px] border border-line bg-surface p-4 text-sm">
      {linked ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2">
            <GithubMark className="h-5 w-5" />
            <span>
              This wallet is linked to <span className="font-medium">@{linked}</span>. Maintainers see your reports as coming
              from that account.
            </span>
          </p>
          <Button variant="secondary" onClick={unlink} disabled={busy}>
            Unlink
          </Button>
        </div>
      ) : session.connected ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p>
            Signed in to GitHub as <span className="font-medium">@{session.login}</span>. Link it to this wallet so the
            maintainer can see you filed the report you&apos;re paying for.
          </p>
          <Button onClick={connect} disabled={busy}>
            {busy ? "Linking…" : `Link @${session.login} to this wallet`}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p>
            <span className="font-medium">Optional:</span> link your GitHub account, so the maintainer can see that the
            deposit comes from the person who filed the report. Reports from linked accounts are easier to trust.
          </p>
          <GithubSignInButton next={pathname} />
        </div>
      )}
      {error && <Notice tone="slashed">{error}</Notice>}
    </div>
  );
}
