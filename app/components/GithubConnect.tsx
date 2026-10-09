"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { post } from "@/lib/api";
import { connectHref, useGithubSession } from "@/lib/github";
import { Button, buttonStyles, Card, Notice } from "./ui";

const messages: Record<string, { tone: "returned" | "waiting" | "slashed"; text: string }> = {
  connected: { tone: "returned", text: "GitHub connected." },
  "no-repos": {
    tone: "waiting",
    text: "GitHub connected, but you're not an admin of any repository the ReportBond app is installed on. Install it on your repo first.",
  },
  cancelled: { tone: "waiting", text: "GitHub connection was cancelled." },
  expired: { tone: "waiting", text: "That GitHub sign-in link expired. Please try again." },
  failed: { tone: "slashed", text: "GitHub sign-in failed. Please try again." },
};

/** Connect GitHub so pools can only be opened for repos you administer. */
export function GithubConnect() {
  const status = useSearchParams().get("github");
  const session = useGithubSession();
  const qc = useQueryClient();
  const s = session.data;
  if (!s?.configured) return null;

  async function disconnect() {
    await post("/api/github/logout", {});
    qc.invalidateQueries({ queryKey: ["github-session"] });
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">GitHub</h2>
          <p className="text-sm text-ink-muted">
            {s.connected
              ? `Connected as @${s.login}. Admin of ${s.repos.length} repositor${s.repos.length === 1 ? "y" : "ies"} with the ReportBond app installed.`
              : "Connect GitHub to prove you maintain the repository. Reporters see a verified badge, and private reports are tracked automatically."}
          </p>
        </div>
        {s.connected ? (
          <div className="flex gap-2">
            <a className={buttonStyles.secondary} href={connectHref("install")}>
              Add repositories
            </a>
            <Button variant="secondary" onClick={disconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <a className={buttonStyles.primary} href={connectHref("install")}>
              Connect GitHub
            </a>
            <a className={buttonStyles.secondary} href={connectHref("signin")}>
              App already installed? Sign in
            </a>
          </div>
        )}
      </div>
      {status && messages[status] && <Notice tone={messages[status].tone}>{messages[status].text}</Notice>}
    </Card>
  );
}
