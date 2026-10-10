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
  depositor: string | null;
  depositorLogin: string | null;
  reporterMatch: "match" | "mismatch" | "unknown";
  title: string | null;
  history: { valid: number; mistake: number; slop: number };
  tags: { label: string; tone: "good" | "warn" | "bad" | "neutral" }[];
};

/** One of the signed-in reporter's own private reports, and what it needs next. */
export type MyReportView = {
  ghsa: string;
  title: string | null;
  url: string;
  repo: string;
  poolId: number;
  reportedAt: number;
  githubState: string;
  bond: "bonded" | "awaiting" | "unbonded";
  bondDeadline: number;
  reportId: number | null;
  status: number | null;
  advisoryHash: `0x${string}`;
  depositAmount: string;
};

export function useGithubSession() {
  return useQuery({ queryKey: ["github-session"], queryFn: () => api<GithubSessionView>("/api/github/session") });
}

export const connectHref = (mode: "install" | "signin", next?: string) =>
  `/api/github/connect?mode=${mode}${next ? `&next=${encodeURIComponent(next)}` : ""}`;
