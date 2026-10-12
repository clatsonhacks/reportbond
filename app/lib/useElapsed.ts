"use client";

import { useEffect, useState } from "react";

/** Seconds since this hook was first called. Mount a component with this hook only while an operation is busy. */
export function useElapsedSinceMount(tickMs = 1000): number {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const t = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), tickMs);
    return () => clearInterval(t);
  }, [tickMs]);
  return seconds;
}
