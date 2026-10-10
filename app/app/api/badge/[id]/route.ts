// GET /api/badge/:poolId — a live SVG badge for a README: "bug bounty | 42.00 USDC · deposit 5.00".
import { formatUsdc } from "@/lib/format";
import { ensureFresh } from "@/lib/server/indexer";

const ENTITIES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ENTITIES[c]);
// Approximate text width for 11px Verdana, good enough to size the two halves.
const width = (s: string) => Math.round(s.length * 6.6) + 12;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pool = (await ensureFresh()).pools[id.replace(/\.svg$/, "")];
  const label = "bug bounty";
  const value = pool
    ? `${formatUsdc(BigInt(pool.fundedBalance) + BigInt(pool.slashedBalance))} · deposit ${formatUsdc(BigInt(pool.depositAmount), false)}`
    : "pool not found";
  const lw = width(label);
  const vw = width(value);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + vw}" height="20" role="img" aria-label="${esc(label)}: ${esc(value)}">
<title>${esc(label)}: ${esc(value)}</title>
<clipPath id="r"><rect width="${lw + vw}" height="20" rx="3"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#24292f"/><rect x="${lw}" width="${vw}" height="20" fill="${pool ? "#0f766e" : "#6b7280"}"/></g>
<g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
<text x="${lw / 2}" y="14">${esc(label)}</text><text x="${lw + vw / 2}" y="14">${esc(value)}</text></g></svg>`;
  return new Response(svg, {
    status: pool ? 200 : 404,
    headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
