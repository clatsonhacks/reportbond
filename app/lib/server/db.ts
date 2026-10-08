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
  getPrivate(): Promise<PrivateData>;
  updatePrivate(fn: (d: PrivateData) => void): Promise<void>;
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
  const privateKey = `${deployment}:private`;

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
    async getPrivate() {
      await init();
      const [row] = await sql<{ value: PrivateData }[]>`select value from reportbond_kv where key = ${privateKey}`;
      return row?.value ?? emptyPrivate();
    },
    async updatePrivate(fn) {
      await init();
      await sql.begin(async (tx) => {
        await tx`insert into reportbond_kv (key, value) values (${privateKey}, ${tx.json(emptyPrivate())}) on conflict do nothing`;
        // Row lock: concurrent requests apply their changes one after another, so none is lost.
        const [row] = await tx<{ value: PrivateData }[]>`select value from reportbond_kv where key = ${privateKey} for update`;
        const d = row.value;
        fn(d);
        await tx`update reportbond_kv set value = ${tx.json(d)}, updated_at = now() where key = ${privateKey}`;
      });
    },
  };
}

// ---------------------------------------------------------------- JSON files

function fileStore(): Store {
  const dir = path.join(process.cwd(), ".data");
  const chainFile = path.join(dir, `${deployment}.chain.json`);
  const privateFile = path.join(dir, `${deployment}.private.json`);

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
    async getPrivate() {
      return read(privateFile, emptyPrivate);
    },
    // No await between read and write, so concurrent requests in this process can't lose each other's writes.
    async updatePrivate(fn) {
      const d = structuredClone(read(privateFile, emptyPrivate));
      fn(d);
      write(privateFile, d);
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
  return store.getPrivate();
}

export function updatePrivate(fn: (d: PrivateData) => void): Promise<void> {
  return store.updatePrivate(fn);
}
