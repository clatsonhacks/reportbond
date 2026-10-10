"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { TriageRun } from "./rules";

export type GithubSessionView = { configured: boolean; connected: boolean; login: string | null; repos: string[] };

export type TrackedReportView = {
  ghsa: string;
  url: string;
  reporter: string | null;
  githubState: string;
  reportedAt: number;
  bond: "bonded" | "awaiting" | "unbonded";
  bondDeadline: number;
  reportId: number | null;
  status: number | null;
  synced: boolean;
  syncError: string | null;
  /** Latest agent run for this report, if any. */
  triage: TriageRun | null;
};

export function useGithubSession() {
  return useQuery({ queryKey: ["github-session"], queryFn: () => api<GithubSessionView>("/api/github/session") });
}

export const connectHref = (mode: "install" | "signin") => `/api/github/connect?mode=${mode}`;
