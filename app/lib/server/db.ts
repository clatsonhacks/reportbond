// The database is a cache; the contract is the truth (docs/ARCHITECTURE.md).
// Two records per deployment (network + contract address):
//   chain    everything derived from contract events. Written only by the indexer;
//            delete it and it rebuilds from the chain.
//   private  what users told us: advisory links and repo names. Each value is accepted only if it
//            hashes to what's on-chain, so it can always be re-checked.
// Storage: Postgres when DATABASE_URL is set (hosting), otherwise JSON files in app/.data (local).
import "server-only";
import "./env";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
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
  /** Filing fees collected through Circle Gateway, by advisory hash. */
  filingFees?: Record<string, { payer: string; amount: string; transaction: string; at: number }>;
};

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

const emptyPrivate = (): PrivateData => ({ advisoryLinks: {}, repoNames: {} });

// Report and pool IDs restart with every deployment, so records are keyed by contract too.
const deployment = `${config.network}-${config.contractAddress.toLowerCase()}`;

type Store = {
  getChain(): Promise<ChainData>;
  /** `force` allows going backwards (re-indexing a restarted local chain). */
  putChain(d: ChainData, force?: boolean): Promise<void>;
  /** Named records ("private", "github", ...) with locked read-modify-write updates. */
  getRecord<T>(name: string, fallback: () => T): Promise<T>;
  updateRecord<T>(name: string, fallback: () => T, fn: (d: T) => void): Promise<void>;
};

// ------------------------------------------------------------------ Postgres

function postgresStore(url: string): Store {
  // prepare: false works with transaction-mode poolers (Supabase, Neon); one connection per serverless instance.
  const sql = postgres(url, { prepare: false, max: Number(process.env.DATABASE_POOL_MAX ?? 1), onnotice: () => {} });
  let ready: Promise<unknown> | null = null;
  const init = () =>
    (ready ??= sql`
      create table if not exists reportbond_kv (
        key text primary key,
        value jsonb not null,
        updated_at timestamptz not null default now()
      )`);
  const chainKey = `${deployment}:chain`;
  const recordKey = (name: string) => `${deployment}:${name}`;

  return {
    async getChain() {
      await init();
      const [row] = await sql<{ value: ChainData }[]>`select value from reportbond_kv where key = ${chainKey}`;
      return row?.value ?? emptyChain();
    },
    async putChain(d, force = false) {
      await init();
      // Two syncs can overlap on serverless; never let an older one overwrite a newer one.
      await sql`
        insert into reportbond_kv (key, value) values (${chainKey}, ${sql.json(d)})
        on conflict (key) do update set value = excluded.value, updated_at = now()
        where ${force} or (reportbond_kv.value->>'lastBlock')::bigint <= (excluded.value->>'lastBlock')::bigint`;
    },
    async getRecord<T>(name: string, fallback: () => T) {
      await init();
      const [row] = await sql<{ value: T }[]>`select value from reportbond_kv where key = ${recordKey(name)}`;
      return row?.value ?? fallback();
    },
    async updateRecord<T>(name: string, fallback: () => T, fn: (d: T) => void) {
      await init();
      const key = recordKey(name);
      await sql.begin(async (tx) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx`insert into reportbond_kv (key, value) values (${key}, ${tx.json(fallback() as any)}) on conflict do nothing`;
        // Row lock: concurrent requests apply their changes one after another, so none is lost.
        const [row] = await tx<{ value: T }[]>`select value from reportbond_kv where key = ${key} for update`;
        const d = row.value;
        fn(d);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx`update reportbond_kv set value = ${tx.json(d as any)}, updated_at = now() where key = ${key}`;
      });
    },
  };
}

// ---------------------------------------------------------------- JSON files

function fileStore(): Store {
  // DATA_DIR lets tests keep their records apart from real local data.
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), ".data");
  const chainFile = path.join(dir, `${deployment}.chain.json`);
  const recordFile = (name: string) => path.join(dir, `${deployment}.${name}.json`);

  // Every read checks the file's mtime, so separate route bundles and the job processes stay in step.
  const cache = new Map<string, { mtimeMs: number; value: unknown }>();
  function read<T>(file: string, fallback: () => T): T {
    if (!existsSync(file)) return fallback();
    const { mtimeMs } = statSync(file);
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit.value as T;
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

  return {
    async getChain() {
      return read(chainFile, emptyChain);
    },
    async putChain(d) {
      write(chainFile, d);
    },
    async getRecord<T>(name: string, fallback: () => T) {
      return read(recordFile(name), fallback);
    },
    // No await between read and write, so concurrent requests in this process can't lose each other's writes.
    async updateRecord<T>(name: string, fallback: () => T, fn: (d: T) => void) {
      const file = recordFile(name);
      const d = structuredClone(read(file, fallback));
      fn(d);
      write(file, d);
    },
  };
}

// --------------------------------------------------------------------- public

// One store per process, shared by every route bundle.
const g = globalThis as { __reportbondStore?: Store };
const store = (g.__reportbondStore ??= process.env.DATABASE_URL ? postgresStore(process.env.DATABASE_URL) : fileStore());

export const storageKind = process.env.DATABASE_URL ? "postgres" : "files";

export async function loadChain(): Promise<ChainData> {
  return structuredClone(await store.getChain());
}

export function saveChain(d: ChainData, force = false): Promise<void> {
  return store.putChain(d, force);
}

export async function loadPrivate(): Promise<PrivateData> {
  return store.getRecord("private", emptyPrivate);
}

export function updatePrivate(fn: (d: PrivateData) => void): Promise<void> {
  return store.updateRecord("private", emptyPrivate, fn);
}

// ------------------------------------------------------------------- GitHub

export type GithubRepo = { id: number; fullName: string; installationId: number };

export type TrackedAdvisory = {
  ghsa: string;
  repo: string; // owner/repo, lowercase
  url: string; // canonical advisory link, as hashed on-chain
  advisoryHash: string;
  reporter: string | null; // GitHub login
  /** The report's title. Private: shown only to the reporter and the pool creator. */
  title?: string;
  githubState: string; // triage, draft, closed, published
  reportedAt: number; // unix seconds
  updatedAt: number;
  /** Verdict status last written back to GitHub, so each one is synced once. */
  syncedStatus?: number;
  syncError?: string;
};

export type GithubData = {
  /** Installations of our GitHub App and the repos each one can access. */
  installations: Record<string, { account: string; repos: Record<string, GithubRepo>; updatedAt: number }>;
  /** Pools whose creator proved admin access to the repo through GitHub. */
  verifiedPools: Record<string, { repo: string; login: string; installationId: number; verifiedAt: number }>;
  /** Private vulnerability reports received by webhook, by GHSA ID. */
  advisories: Record<string, TrackedAdvisory>;
  /** Maintainer GitHub sessions, by random session ID. */
  sessions: Record<string, { login: string; repos: GithubRepo[]; expiresAt: number }>;
  /** Recent webhook delivery IDs, so a redelivered webhook is applied once. */
  deliveries: string[];
  /** GitHub account linked to a wallet (lowercase address), proven by a GitHub session plus a wallet signature. */
  walletLinks?: Record<string, { login: string; linkedAt: number }>;
};

export const emptyGithub = (): GithubData => ({
  installations: {},
  verifiedPools: {},
  advisories: {},
  sessions: {},
  deliveries: [],
});

export async function loadGithub(): Promise<GithubData> {
  return store.getRecord("github", emptyGithub);
}

export function updateGithub(fn: (d: GithubData) => void): Promise<void> {
  return store.updateRecord("github", emptyGithub, fn);
}

// ------------------------------------------------------------ rules and triage

import type { Rulebook, RulebookVersion, TriageRun } from "../rules";

/** Bounty rulebooks by pool ID: the working draft and every published version. */
export type RulesData = Record<string, { draft: Rulebook | null; versions: RulebookVersion[] }>;
/** Agent runs by GHSA ID, newest last. This is the audit log of what the agents saw and said. */
export type TriageData = Record<string, { runs: TriageRun[] }>;

export const loadRules = (): Promise<RulesData> => store.getRecord<RulesData>("rules", () => ({}));
export const updateRules = (fn: (d: RulesData) => void): Promise<void> => store.updateRecord<RulesData>("rules", () => ({}), fn);
export const loadTriage = (): Promise<TriageData> => store.getRecord<TriageData>("triage", () => ({}));
export const updateTriage = (fn: (d: TriageData) => void): Promise<void> =>
  store.updateRecord<TriageData>("triage", () => ({}), fn);
