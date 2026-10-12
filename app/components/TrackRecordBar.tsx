import type { Outcomes } from "@/lib/types";

/** A thin stacked bar of valid/mistake/slop/refunded outcomes, shared by pool cards and the personal
 * dashboard — same shape (an `Outcomes` tally), different source. */
export function TrackRecordBar({ record }: { record: Outcomes }) {
  const total = record.valid + record.mistake + record.slop + record.refunded;
  if (total === 0) return <span className="text-xs text-ink-muted">No history</span>;

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-1.5 w-20 overflow-hidden rounded-full bg-surface">
        {record.valid > 0 && <div className="bg-valid" style={{ width: `${(record.valid / total) * 100}%` }} />}
        {record.mistake > 0 && <div className="bg-mistake" style={{ width: `${(record.mistake / total) * 100}%` }} />}
        {record.slop > 0 && <div className="bg-slop" style={{ width: `${(record.slop / total) * 100}%` }} />}
        {record.refunded > 0 && <div className="bg-refunded" style={{ width: `${(record.refunded / total) * 100}%` }} />}
      </div>
      <span className="text-xs text-ink-muted">
        {record.valid} of {total} resolved were valid
      </span>
    </div>
  );
}
