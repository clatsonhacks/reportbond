"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { post } from "@/lib/api";
import { connectHref, useGithubSession } from "@/lib/github";
import { Button, buttonStyles, Card, Notice } from "./ui";

const messages: Record<string, { tone: "returned" | "waiting" | "slashed"; text: string }> = {
  connected: { tone: "returned", text: "Signed in with GitHub." },
  "no-repos": {
    tone: "waiting",
    text: "Signed in. Now choose which repositories ReportBond may access.",
  },
  cancelled: { tone: "waiting", text: "GitHub sign-in was cancelled." },
  expired: { tone: "waiting", text: "That GitHub sign-in link expired. Please try again." },
  failed: { tone: "slashed", text: "GitHub sign-in failed. Please try again." },
};

export function GithubMark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/**
 * The one button a maintainer needs. Signs in with GitHub when the site's GitHub App exists;
 * otherwise it leads the site owner to the one-time setup.
 */
export function GithubSignInButton({ label = "Sign in with GitHub", next }: { label?: string; next?: string }) {
  const session = useGithubSession();
  const configured = session.data?.configured;
  return (
    <a
      href={configured ? connectHref("signin", next) : "/setup/github"}
      className="state-change inline-flex items-center gap-3 rounded-xl border border-line bg-card px-5 py-3 text-base font-medium text-ink shadow-sm hover:border-accent hover:shadow-md"
    >
      <GithubMark />
      {label}
    </a>
  );
}

/** Sign in with GitHub so pools can only be opened for repos you administer. */
export function GithubConnect() {
  const status = useSearchParams().get("github");
  const session = useGithubSession();
  const qc = useQueryClient();
  const s = session.data;
  if (!s) return null;

  async function disconnect() {
    await post("/api/github/logout", {});
    qc.invalidateQueries({ queryKey: ["github-session"] });
  }

  if (!s.connected) {
    return (
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">Start with GitHub</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Sign in and choose the repositories ReportBond may read. You&apos;ll pick your repo from a list, reporters see a
            verified badge, and private reports are tracked automatically.
          </p>
        </div>
        <GithubSignInButton />
        {!s.configured && (
          <p className="text-xs text-ink-muted">
            First time on this site: this opens a one-time setup that creates the ReportBond app on GitHub.
          </p>
        )}
        {status && messages[status] && <Notice tone={messages[status].tone}>{messages[status].text}</Notice>}
      </Card>
    );
  }

  const none = s.repos.length === 0;
  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <GithubMark className="h-8 w-8" />
          <div>
            <p className="font-semibold">@{s.login}</p>
            <p className="text-sm text-ink-muted">
              {none
                ? "No repositories shared with ReportBond yet."
                : `${s.repos.length} repositor${s.repos.length === 1 ? "y" : "ies"} shared with ReportBond.`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <a className={none ? buttonStyles.primary : buttonStyles.secondary} href={connectHref("install")}>
            {none ? "Choose repositories" : "Add repositories"}
          </a>
          <Button variant="secondary" onClick={disconnect}>
            Sign out
          </Button>
        </div>
      </div>
      {none && (
        <p className="text-sm text-ink-muted">
          GitHub will ask which of your repositories ReportBond may read. Only repositories you administer can be used
          for a pool.
        </p>
      )}
      {status && messages[status] && <Notice tone={messages[status].tone}>{messages[status].text}</Notice>}
    </Card>
  );
}
