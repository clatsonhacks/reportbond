// Money is always computed as 18-decimal bigints and shown as "5.00 USDC" (docs/DESIGN.md).
import { formatUnits, parseUnits } from "viem";

export const USDC_DECIMALS = 18;

export function parseUsdc(value: string): bigint {
  return parseUnits(value.trim(), USDC_DECIMALS);
}

/** Two decimals, rounded down so we never show more than someone has. */
export function formatUsdc(value: bigint, withUnit = true): string {
  // Up to six decimals so nano deposits (0.001 USDC) show exactly; at least two, so 5 reads "5.00".
  const micro = value / 10n ** 12n;
  const whole = micro / 1_000_000n;
  let frac = (micro % 1_000_000n).toString().padStart(6, "0");
  while (frac.length > 2 && frac.endsWith("0")) frac = frac.slice(0, -1);
  const s = `${whole.toLocaleString("en-US")}.${frac}`;
  return withUnit ? `${s} USDC` : s;
}

/** For form inputs: the exact value, without trailing zeros. */
export function usdcInput(value: bigint): string {
  return formatUnits(value, USDC_DECIMALS);
}

export function shortAddress(a: string): string {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function formatDate(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 minutes";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.ceil((seconds % 3600) / 60);
  if (d >= 1) return `${d} day${d === 1 ? "" : "s"}${h ? ` ${h} h` : ""}`;
  if (h >= 1) return `${h} h${m ? ` ${m} min` : ""}`;
  return `${m} minute${m === 1 ? "" : "s"}`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
