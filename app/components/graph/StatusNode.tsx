import { Status } from "@/lib/eip712";

/** The 6-way status glyph shared by every report graph: a filled circle for a verdict, a ring (plus a
 * dot or dashes) while the report is still open or was auto-refunded. Shared so every graph that draws
 * reports (pool network, per-pool constellation, per-wallet network) stays visually consistent. */
export function StatusNode({ status, r }: { status: number; r: number }) {
  if (status === Status.Valid) return <circle r={r} className="fill-valid" />;
  if (status === Status.Mistake) return <circle r={r} className="fill-mistake" />;
  if (status === Status.Slop) return <circle r={r} className="fill-slop" />;
  if (status === Status.Refunded)
    return <circle r={r - 1} className="fill-card stroke-refunded" strokeWidth={2} strokeDasharray="3 2" />;
  if (status === Status.Acknowledged)
    return (
      <>
        <circle r={r - 1} className="fill-card stroke-acknowledged" strokeWidth={2} />
        <circle r={3} className="fill-acknowledged" />
      </>
    );
  return <circle r={r - 1} className="fill-card stroke-waiting" strokeWidth={2} />;
}
