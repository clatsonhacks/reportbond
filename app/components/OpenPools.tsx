"use client";

// The homepage's pool list with its sort buttons.
import { useState } from "react";
import { PoolList, type PoolSort } from "./PoolList";

const sorts: { key: PoolSort; label: string }[] = [
  { key: "bounty", label: "Highest bounty" },
  { key: "response", label: "Fastest response" },
  { key: "bond", label: "Lowest bond" },
];

export function OpenPools() {
  const [sort, setSort] = useState<PoolSort>("bounty");
  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-black tracking-tight">Open pools</h2>
        <div className="flex gap-1 overflow-x-auto">
          {sorts.map((s) => (
            <button
              key={s.key}
              type="button"
              aria-pressed={sort === s.key}
              onClick={() => setSort(s.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium whitespace-nowrap state-change ${
                sort === s.key ? "bg-ink text-card" : "border border-line text-ink-muted hover:bg-surface"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
      <PoolList sort={sort} />
    </>
  );
}
