# Implementing Protocol Fees - Step-by-Step Guide

## Overview

This guide shows how to migrate from the current fee-less ReportBond contract to ReportBondWithFees for mainnet sustainability.

## Step 1: Review Fee Structure

Current contract: **No fees**
- Reporters pay exact deposit
- Maintainers fund pools at cost
- Platform loses money on gas

New contract: **Minimal fees**
- Report submission: +1% fee
- Pool creation: +1 USDC fee
- Bounty payout: +2% fee from pool

See [PROTOCOL_FEES.md](./PROTOCOL_FEES.md) for economic analysis.

## Step 2: Deploy Contract with Fees

### 2.1 Choose Protocol Owner

The protocol owner can withdraw accumulated fees. Options:

**For Development/Testing:**
```bash
# Use deployer address
PROTOCOL_OWNER=$DEPLOYER_ADDRESS
```

**For Production (Recommended):**
```bash
# Use a multisig wallet (Gnosis Safe)
PROTOCOL_OWNER=0x... # Your Gnosis Safe address

# Or use a dedicated operations wallet
PROTOCOL_OWNER=0x... # Separate from deployer
```

### 2.2 Deploy to Mainnet

```bash
cd contracts

# Compile with fees contract
forge build

# Deploy
forge script script/DeployWithFees.s.sol \
  --rpc-url https://rpc.mainnet.arc.network \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify
```

**Output:**
```
ReportBondWithFees deployed at: 0x...
Block number: 12345678
Protocol Owner: 0x...

Fee Structure:
- Report submission fee: 1% (100 bps)
- Pool creation fee: 1 USDC
- Bounty payout fee: 2% (200 bps)
```

### 2.3 Update Config

Update `config/mainnet.json`:
```json
{
  "address": "0x...",
  "deployBlock": 12345678
}
```

## Step 3: Update Frontend

### 3.1 Update Report Submission Flow

**File**: `app/app/pool/[id]/report/page.tsx`

```typescript
import { ReportFeeBreakdown } from "@/components/FeeBreakdown";

// In the form, before submit button:
<ReportFeeBreakdown depositAmount={pool.depositAmount} />

// Update transaction to include fee:
const REPORT_FEE_BPS = 100;
const fee = (pool.depositAmount * BigInt(REPORT_FEE_BPS)) / 10_000n;
const totalCost = pool.depositAmount + fee;

await writeContractAsync({
  ...reportBond,
  functionName: "submitReport",
  args: [poolId, advisoryHash],
  value: totalCost, // Changed from pool.depositAmount
});
```

### 3.2 Update Pool Creation Flow

**File**: `app/app/maintainer/page.tsx`

```typescript
import { PoolCreationFeeNotice } from "@/components/FeeBreakdown";

// In CreatePool form:
const POOL_CREATION_FEE = 1_000_000n; // 1 USDC

// Show fee notice:
{funding && <PoolCreationFeeNotice initialFunding={parseUsdc(funding)} />}

// Update transaction:
const fundingAmount = funding.trim() ? parseUsdc(funding) : 0n;
const totalCost = fundingAmount + POOL_CREATION_FEE;

await writeContractAsync({
  ...reportBond,
  functionName: "createPool",
  args: [repoIdOf(repo), verdictSigner, values.dep, values.timeout, values.max],
  value: totalCost, // Changed from values.fund
});
```

### 3.3 Add Fee Explainer to Landing Page

**File**: `app/app/page.tsx`

```typescript
import { ProtocolFeeExplainer } from "@/components/FeeBreakdown";

// Add after "How it Works" section:
<section className="space-y-6">
  <ProtocolFeeExplainer />
</section>
```

### 3.4 Update ABI

After deploying the new contract:

```bash
cd app
pnpm sync-abi
```

This copies the new ABI with fee functions.

## Step 4: Update Documentation

### 4.1 README.md

Add fee disclosure:

```markdown
## Protocol Fees

ReportBond charges minimal fees to sustain operations:
- Report submission: 1% of deposit
- Pool creation: 1 USDC
- Bounty payout: 2% of bounty

See [PROTOCOL_FEES.md](./PROTOCOL_FEES.md) for details.
```

### 4.2 Landing Page

Update hero section to mention fees:

```tsx
<p className="text-sm text-gray-600">
  Minimal 1-2% protocol fees cover gas and infrastructure
</p>
```

## Step 5: Test on Testnet

Before mainnet, test the fee flow:

### 5.1 Deploy to Testnet

```bash
forge script script/DeployWithFees.s.sol \
  --rpc-url https://rpc.drpc.testnet.arc.network \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

### 5.2 Update Config

```json
// config/testnet.json
{
  "address": "0x...",
  "deployBlock": 67890123
}
```

### 5.3 Test Flows

1. **Create pool with fees**
   ```bash
   # Should require 101 USDC for 100 USDC funding
   ```

2. **Submit report with fees**
   ```bash
   # Should require 5.05 USDC for 5 USDC deposit
   ```

3. **Check protocol fees**
   ```bash
   cast call $CONTRACT "protocolFees()(uint256)" --rpc-url $RPC
   ```

4. **Withdraw fees**
   ```bash
   cast send $CONTRACT "withdrawProtocolFees()" \
     --private-key $PROTOCOL_OWNER_KEY \
     --rpc-url $RPC
   ```

## Step 6: Monitor Fees

### 6.1 View Accumulated Fees

```bash
# Using cast
cast call 0x... "protocolFees()(uint256)" --rpc-url https://rpc.mainnet.arc.network

# Or add to your app:
const fees = await contract.read.protocolFees();
console.log(`Accumulated fees: ${formatUsdc(fees)}`);
```

### 6.2 Set Up Withdrawal Schedule

Create a cron job to withdraw fees monthly:

```typescript
// app/api/cron/withdraw-fees/route.ts
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { reportBond } from "@/lib/contract";

export async function GET(req: Request) {
  // Verify cron secret
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = privateKeyToAccount(process.env.PROTOCOL_OWNER_PRIVATE_KEY as `0x${string}`);
  const client = createWalletClient({ account, transport: http() });

  const fees = await client.readContract({
    ...reportBond,
    functionName: "protocolFees",
  });

  if (fees === 0n) {
    return Response.json({ message: "No fees to withdraw", fees: "0" });
  }

  const hash = await client.writeContract({
    ...reportBond,
    functionName: "withdrawProtocolFees",
  });

  return Response.json({ message: "Fees withdrawn", hash, amount: fees.toString() });
}
```

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/keeper",
      "schedule": "0 * * * *"
    },
    {
      "path": "/api/cron/withdraw-fees",
      "schedule": "0 0 1 * *"
    }
  ]
}
```

## Step 7: Fee Transparency Dashboard

Create a public dashboard showing fee usage:

```typescript
// app/app/fees/page.tsx
export default function FeesPage() {
  const { data } = useQuery({
    queryKey: ["protocol-fees"],
    queryFn: async () => {
      const fees = await publicClient.readContract({
        ...reportBond,
        functionName: "protocolFees",
      });
      return { accumulated: fees };
    },
  });

  return (
    <div>
      <h1>Protocol Fees Transparency</h1>
      <div>
        <h2>Accumulated: <Amount value={data?.accumulated ?? 0n} /></h2>
        <p>These fees cover relayer gas and infrastructure costs.</p>
      </div>
    </div>
  );
}
```

## Checklist Before Mainnet

- [ ] Contract deployed with correct protocol owner
- [ ] Frontend updated to show fees clearly
- [ ] All transactions include fee calculations
- [ ] Tested on testnet thoroughly
- [ ] Documentation updated (README, landing page)
- [ ] Fee withdrawal process tested
- [ ] Monitoring/alerts set up for fee collection
- [ ] Legal review of fee disclosure (if required)
- [ ] User communication about fees prepared

## Fee Adjustment (Future)

If you need to change fees later:

1. Deploy a new contract with different constants
2. Migrate pools/reports (or start fresh)
3. Update frontend and documentation

**Note:** Fees are immutable in a deployed contract. Plan carefully!

## Questions?

- **Too many slashed deposits?** Consider lowering report fee
- **Not covering costs?** Increase bounty fee slightly (2% → 3%)
- **Users complaining?** Show fee transparency dashboard
- **Revenue exceeds costs?** Consider reducing fees or adding features

Start with the recommended fees, measure real costs, adjust as needed.
