"use client";

import { Amount } from "./ui";

// Protocol fee constants (must match contract)
const REPORT_FEE_BPS = 100; // 1%
const POOL_CREATION_FEE = 1_000_000n; // 1 USDC (6 decimals)
const BOUNTY_FEE_BPS = 200; // 2%
const BASIS_POINTS = 10_000;

export function ReportFeeBreakdown({ depositAmount }: { depositAmount: bigint }) {
  const fee = (depositAmount * BigInt(REPORT_FEE_BPS)) / BigInt(BASIS_POINTS);
  const total = depositAmount + fee;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
      <div className="mb-2 font-semibold">Transaction Breakdown</div>
      <div className="space-y-1 text-ink-muted">
        <div className="flex justify-between">
          <span>Refundable deposit:</span>
          <Amount value={depositAmount} className="font-mono" />
        </div>
        <div className="flex justify-between">
          <span>Protocol fee (1%):</span>
          <Amount value={fee} className="font-mono" />
        </div>
        <div className="border-t border-line pt-1 mt-1 flex justify-between font-semibold text-ink">
          <span>Total to pay:</span>
          <Amount value={total} className="font-mono" />
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        The protocol fee covers relayer gas costs and platform infrastructure.
      </p>
    </div>
  );
}

export function PoolCreationFeeNotice({ initialFunding }: { initialFunding: bigint }) {
  const fee = POOL_CREATION_FEE;
  const total = initialFunding + fee;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 text-sm">
      <div className="mb-2 font-semibold">Pool Creation Cost</div>
      <div className="space-y-1 text-ink-muted">
        <div className="flex justify-between">
          <span>Initial bounty funding:</span>
          <Amount value={initialFunding} className="font-mono" />
        </div>
        <div className="flex justify-between">
          <span>One-time creation fee:</span>
          <Amount value={fee} className="font-mono" />
        </div>
        <div className="border-t border-line pt-1 mt-1 flex justify-between font-semibold text-ink">
          <span>Total to pay:</span>
          <Amount value={total} className="font-mono" />
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        The creation fee is charged once to support platform operations. Your funding is fully available for bounties.
      </p>
    </div>
  );
}

export function BountyFeeInfo({ bounty }: { bounty: bigint }) {
  const fee = (bounty * BigInt(BOUNTY_FEE_BPS)) / BigInt(BASIS_POINTS);
  const reporterGets = bounty;
  const poolPays = bounty + fee;

  return (
    <div className="rounded-2xl border border-returned/20 bg-returned-bg p-4 text-sm">
      <div className="mb-2 font-semibold text-returned">Bounty Payout Breakdown</div>
      <div className="space-y-1 text-ink-muted">
        <div className="flex justify-between">
          <span>Reporter receives:</span>
          <Amount value={reporterGets} className="font-mono text-returned font-semibold" />
        </div>
        <div className="flex justify-between">
          <span>Protocol fee (2%):</span>
          <Amount value={fee} className="font-mono" />
        </div>
        <div className="border-t border-returned/20 pt-1 mt-1 flex justify-between font-semibold text-ink">
          <span>Pool pays:</span>
          <Amount value={poolPays} className="font-mono" />
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        The platform fee on bounties helps sustain the service for future security researchers.
      </p>
    </div>
  );
}

export function ProtocolFeeExplainer() {
  return (
    <details className="rounded-2xl border border-line bg-card p-5">
      <summary className="cursor-pointer font-medium text-sm">Why does ReportBond charge fees?</summary>
      <div className="mt-3 space-y-3 text-sm text-ink-muted">
        <p>
          Unlike centralized platforms with 10-20% fees, ReportBond charges minimal fees (1-2%) to cover actual
          operating costs:
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Relayer gas costs:</strong> Every verdict and acknowledgment requires a blockchain transaction
          </li>
          <li>
            <strong>Infrastructure:</strong> Database hosting, indexer servers, and API endpoints
          </li>
          <li>
            <strong>Development:</strong> Ongoing security audits, bug fixes, and feature improvements
          </li>
        </ul>
        <p className="text-xs">
          All fees are transparent and hardcoded in the smart contract. We don't take hidden fees or commissions.
        </p>
        <div className="rounded-xl bg-surface p-3 mt-2">
          <div className="text-xs font-semibold mb-1">Fee Breakdown:</div>
          <div className="grid gap-1 text-xs">
            <div>• Report submission: 1% of deposit</div>
            <div>• Pool creation: 1 USDC (one-time)</div>
            <div>• Bounty payout: 2% of bounty</div>
          </div>
        </div>
      </div>
    </details>
  );
}
