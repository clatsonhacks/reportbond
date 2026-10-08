// The database is a cache; the contract is the truth (docs/ARCHITECTURE.md).
// Two files per network in app/.data/:
//   <network>.chain.json    everything derived from contract events. Written only by the indexer;
//                           delete it and it rebuilds from the chain.
//   <network>.private.json  what users told us: advisory links and repo names. Each value is accepted
//                           only if it hashes to what's on-chain, so it can always be re-checked.
// Every read checks the file's mtime, so separate route bundles and the job processes stay in step.
// Local storage is JSON files; swap this module for Postgres when hosting.
import "server-only";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../network";

export type EventKind =
  | "PoolCreated"
  | "PoolFunded"
  | "ReportSubmitted"
  | "ReportAcknowledged"
  | "VerdictGiven"
  | "ReportRefunded"
  | "Withdrawn"
  | "PoolFundsWithdrawn";

export type TimelineEntry = {
  kind: EventKind;
  tx: string;
  block: number;
  time: number;
  amount?: string;
  status?: number;
};

export type PoolRow = {
  id: number;
  repoId: string;
  creator: string;
  verdictSigner: string;
  depositAmount: string;
  timeout: number;
  maxPayout: string;
  fundedBalance: string;
  slashedBalance: string;
  openReports: number;
  createdAt: number;
  createdTx: string;
};

export type ReportRow = {
  id: number;
  poolId: number;
  reporter: string;
  deposit: string;
  createdAt: number;
  deadline: number;
  status: number;
  bounty: string;
  advisoryHash: string;
  timeline: TimelineEntry[];
};

export type ChainData = {
  chainId: number;
  contract: string;
  lastBlock: number;
  pools: Record<string, PoolRow>;
  reports: Record<string, ReportRow>;
  /** Withdrawals per account, for the reporter's history. */
  withdrawals: Record<string, TimelineEntry[]>;
};

export type PrivateData = {
  /** Advisory links by report ID. Only shown to the reporter and pool creator. */
  advisoryLinks: Record<string, string>;
  /** "owner/repo" by pool ID. */
  repoNames: Record<string, string>;
};

const dir = path.join(process.cwd(), ".data");
const chainFile = path.join(dir, `${config.network}.chain.json`);
const privateFile = path.join(dir, `${config.network}.private.json`);

export function emptyChain(): ChainData {
  return {
    chainId: config.chainId,
    contract: config.contractAddress.toLowerCase(),
    lastBlock: config.deployBlock - 1,
    pools: {},
    reports: {},
    withdrawals: {},
  };
}

type Cached<T> = { mtimeMs: number; value: T };
const cache = new Map<string, Cached<unknown>>();

function read<T>(file: string, fallback: () => T): T {
  if (!existsSync(file)) return fallback();
  const { mtimeMs } = statSync(file);
  const hit = cache.get(file) as Cached<T> | undefined;
  if (hit && hit.mtimeMs === mtimeMs) return hit.value;
  const value = JSON.parse(readFileSync(file, "utf8")) as T;
  cache.set(file, { mtimeMs, value });
  return value;
}

function write(file: string, value: unknown) {
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
  cache.set(file, { mtimeMs: statSync(file).mtimeMs, value });
}

export function loadChain(): ChainData {
  const d = read(chainFile, emptyChain);
  // A new deployment or network invalidates the chain cache.
  if (d.chainId !== config.chainId || d.contract !== config.contractAddress.toLowerCase()) return emptyChain();
  return d;
}

export function saveChain(d: ChainData): void {
  write(chainFile, d);
}

export function loadPrivate(): PrivateData {
  return read(privateFile, () => ({ advisoryLinks: {}, repoNames: {} }));
}

/** Read-modify-write with no await in between, so concurrent requests can't lose each other's writes. */
export function updatePrivate(fn: (d: PrivateData) => void): void {
  const d = structuredClone(loadPrivate());
  fn(d);
  write(privateFile, d);
}
