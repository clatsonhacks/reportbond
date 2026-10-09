"use client";

import { useQuery } from "@tanstack/react-query";
import type { PoolView, ReportView, StatusView } from "./types";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

export const post = <T,>(path: string, body: unknown, headers?: Record<string, string>) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body), headers });

export function useStatus() {
  return useQuery({
    queryKey: ["status"],
    queryFn: () => api<StatusView>("/api/status"),
    staleTime: 5 * 60 * 1000, // 5 minutes - status rarely changes
    gcTime: 10 * 60 * 1000,
  });
}

export function usePools(creator?: string) {
  return useQuery({
    queryKey: ["pools", creator ?? null],
    queryFn: () => api<{ pools: PoolView[] }>(`/api/pools${creator ? `?creator=${creator}` : ""}`),
    staleTime: 30 * 1000, // 30 seconds - pools don't change that often
    gcTime: 5 * 60 * 1000,
  });
}

export function usePool(id: string) {
  return useQuery({
    queryKey: ["pool", id],
    queryFn: () => api<{ pool: PoolView; recent: ReportView[] }>(`/api/pools/${id}`),
    staleTime: 20 * 1000, // 20 seconds
    gcTime: 5 * 60 * 1000,
  });
}

export function useReport(id: string) {
  return useQuery({
    queryKey: ["report", id],
    queryFn: () => api<{ report: ReportView; pool: PoolView | null }>(`/api/reports/${id}`),
    refetchInterval: 30_000, // Reduced from 10s to 30s
    staleTime: 15 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useReports(params: Record<string, string | undefined>, enabled = true) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({
    queryKey: ["reports", q],
    queryFn: () => api<{ reports: ReportView[] }>(`/api/reports?${q}`),
    enabled,
    refetchInterval: 30_000, // Reduced from 15s to 30s
    staleTime: 20 * 1000,
    gcTime: 5 * 60 * 1000,
  });
}
