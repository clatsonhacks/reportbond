import "server-only";
import type { ChainData, PoolRow, PrivateData, ReportRow } from "./db";
import type { PoolView, ReportView } from "../types";

export function poolView(d: ChainData, priv: PrivateData, p: PoolRow): PoolView {
  const outcomes = { valid: 0, mistake: 0, slop: 0, refunded: 0 };
  for (const r of Object.values(d.reports)) {
    if (r.poolId !== p.id) continue;
    if (r.status === 3) outcomes.valid++;
    else if (r.status === 4) outcomes.mistake++;
    else if (r.status === 5) outcomes.slop++;
    else if (r.status === 6) outcomes.refunded++;
  }
  return {
    ...p,
    repoName: priv.repoNames[p.id] ?? null,
    available: (BigInt(p.fundedBalance) + BigInt(p.slashedBalance)).toString(),
    outcomes,
  };
}

export function reportView(priv: PrivateData, r: ReportRow): ReportView {
  return {
    ...r,
    repoName: priv.repoNames[r.poolId] ?? null,
    hasAdvisoryLink: Boolean(priv.advisoryLinks[r.id]),
  };
}

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function bad(message: string, status = 400) {
  return json({ error: message }, status);
}
