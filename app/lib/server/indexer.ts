// Reads contract events from the deployment block onwards and stores pools and reports.
// Safe to run any number of times: it resumes from the last block it read.
import "server-only";
import { zeroAddress, type Log } from "viem";
import { publicClient } from "../clients";
import { reportBond } from "../contract";
import { config } from "../network";
import { emptyChain, loadChain, saveChain, type ChainData, type EventKind, type TimelineEntry } from "./db";

const CHUNK = 5_000n;
const PARALLEL = 6;
const MIN_INTERVAL_MS = 1_000;
// Serverless functions must answer quickly; long-running jobs set SYNC_BUDGET_MS=0 (no limit).
const BUDGET_MS = Number(process.env.SYNC_BUDGET_MS ?? (process.env.VERCEL ? 6_000 : 0));

// Next bundles each route separately; keeping sync state on globalThis means they share one sync.
const state = ((globalThis as { __reportbondIndexer?: { running: Promise<ChainData> | null; lastRun: number } })
  .__reportbondIndexer ??= { running: null, lastRun: 0 });

export const isDeployed = config.contractAddress !== zeroAddress;

/** Sync now, sharing any sync already in flight. */
export function syncOnce(): Promise<ChainData> {
  if (!state.running) {
    state.running = doSync().finally(() => {
      state.running = null;
      state.lastRun = Date.now();
    });
  }
  return state.running;
}

/** Sync starting now, so blocks mined before this call are included (use after "not found"). */
export async function syncFresh(): Promise<ChainData> {
  if (state.running) await state.running.catch(() => {});
  return syncOnce();
}

/** For API routes: sync at most every second, so pages are fresh without a separate job locally. */
export async function ensureFresh(): Promise<ChainData> {
  if (!isDeployed) return await loadChain();
  if (state.running) return state.running;
  if (Date.now() - state.lastRun < MIN_INTERVAL_MS) return await loadChain();
  try {
    return await syncOnce();
  } catch (e) {
    console.error("[indexer] sync failed, serving cached data:", e);
    return await loadChain();
  }
}

type DecodedLog = Log<bigint, number, false> & { eventName: EventKind; args: Record<string, unknown> };

async function doSync(): Promise<ChainData> {
  let d = await loadChain();
  if (!isDeployed) return d;

  const latest = await publicClient.getBlockNumber();
  if (BigInt(d.lastBlock) > latest) {
    // The chain is behind our cache (a restarted local chain): rebuild from the deployment block.
    console.warn(`[indexer] cache is at block ${d.lastBlock} but the chain is at ${latest}; re-indexing`);
    d = emptyChain();
    await saveChain(d, true);
  }
  let from = BigInt(d.lastBlock + 1);
  if (from > latest) return d;

  const touchedPools = new Set<number>();
  const blockTimes = new Map<bigint, number>();

  // Fetch several chunks at once, apply them in block order. On a serverless host each sync has a time
  // budget: it saves how far it got and the next request carries on, so a long backlog can't time out
  // and lose everything. Jobs (no budget) run until caught up.
  const started = Date.now();
  while (from <= latest) {
    const ranges: [bigint, bigint][] = [];
    for (let f = from; f <= latest && ranges.length < PARALLEL; f += CHUNK) {
      ranges.push([f, f + CHUNK - 1n > latest ? latest : f + CHUNK - 1n]);
    }
    const batches = (await Promise.all(
      ranges.map(([fromBlock, toBlock]) => publicClient.getContractEvents({ ...reportBond, fromBlock, toBlock })),
    )) as unknown as DecodedLog[][];
    const logs = batches.flat();

    for (const b of new Set(logs.map((l) => l.blockNumber))) {
      if (!blockTimes.has(b)) {
        const block = await publicClient.getBlock({ blockNumber: b });
        blockTimes.set(b, Number(block.timestamp));
      }
    }

    for (const log of logs) apply(d, log, blockTimes.get(log.blockNumber)!, touchedPools);
    const to = ranges[ranges.length - 1][1];
    d.lastBlock = Number(to);
    from = to + 1n;
    if (BUDGET_MS && Date.now() - started > BUDGET_MS && from <= latest) {
      console.warn(`[indexer] time budget reached at block ${d.lastBlock} of ${latest}; continuing on the next sync`);
      break;
    }
  }

  // Balances come from the contract itself, so the cache never re-implements the bounty math.
  for (const id of touchedPools) {
    const p = await publicClient.readContract({
      ...reportBond,
      functionName: "pools",
      args: [BigInt(id)],
      blockNumber: latest,
    });
    const row = d.pools[id];
    if (!row) continue;
    row.fundedBalance = p[6].toString();
    row.slashedBalance = p[7].toString();
    row.openReports = Number(p[8]);
  }

  await saveChain(d);
  return d;
}

function apply(d: ChainData, log: DecodedLog, time: number, touchedPools: Set<number>) {
  const a = log.args as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- decoded per event below
  const entry: TimelineEntry = { kind: log.eventName, tx: log.transactionHash!, block: Number(log.blockNumber), time };

  switch (log.eventName) {
    case "PoolCreated": {
      const id = Number(a.poolId);
      d.pools[id] = {
        id,
        repoId: a.repoId,
        creator: a.creator.toLowerCase(),
        verdictSigner: a.verdictSigner.toLowerCase(),
        depositAmount: a.depositAmount.toString(),
        timeout: Number(a.timeout),
        maxPayout: a.maxPayout.toString(),
        fundedBalance: a.initialFunding.toString(),
        slashedBalance: "0",
        openReports: 0,
        createdAt: time,
        createdTx: entry.tx,
      };
      touchedPools.add(id);
      break;
    }
    case "PoolFunded":
    case "PoolFundsWithdrawn":
      touchedPools.add(Number(a.poolId));
      break;
    case "ReportSubmitted": {
      const id = Number(a.reportId);
      d.reports[id] = {
        id,
        poolId: Number(a.poolId),
        reporter: a.reporter.toLowerCase(),
        deposit: a.deposit.toString(),
        createdAt: time,
        deadline: Number(a.deadline),
        status: 1,
        bounty: "0",
        advisoryHash: a.advisoryHash,
        timeline: [{ ...entry, amount: a.deposit.toString() }],
      };
      touchedPools.add(Number(a.poolId));
      break;
    }
    case "ReportAcknowledged": {
      const r = d.reports[Number(a.reportId)];
      if (r) {
        r.status = 2;
        r.timeline.push(entry);
      }
      break;
    }
    case "VerdictGiven": {
      const r = d.reports[Number(a.reportId)];
      if (r) {
        r.status = Number(a.verdict);
        r.bounty = a.bounty.toString();
        r.timeline.push({ ...entry, status: r.status, amount: a.bounty.toString() });
        touchedPools.add(r.poolId);
      }
      break;
    }
    case "ReportRefunded": {
      const r = d.reports[Number(a.reportId)];
      if (r) {
        r.status = 6;
        r.timeline.push({ ...entry, amount: a.amount.toString() });
        touchedPools.add(r.poolId);
      }
      break;
    }
    case "Withdrawn": {
      const who = a.account.toLowerCase();
      (d.withdrawals[who] ??= []).push({ ...entry, amount: a.amount.toString() });
      break;
    }
  }
}
