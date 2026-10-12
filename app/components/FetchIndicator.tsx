"use client";

// A thin bar at the very top of the page so background work (polling, refetches, mutations) is
// always visible, not just the fetches a component happens to render feedback for.
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

export function FetchIndicator() {
  const active = useIsFetching() + useIsMutating() > 0;
  return (
    <div
      aria-hidden
      className={`fixed inset-x-0 top-0 z-[60] h-0.5 bg-brand pulse-slow transition-opacity duration-300 ${active ? "opacity-100" : "opacity-0"}`}
    />
  );
}
