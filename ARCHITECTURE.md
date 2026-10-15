# ReportBond Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              REPORTBOND                                      │
│                     Bug Bounty Platform on Arc                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  REPORTER   │     │ MAINTAINER  │     │   RELAYER   │     │   KEEPER    │
│  (Wallet)   │     │  (Wallet)   │     │   (Server)  │     │   (Cron)    │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │                   │
       │ Submit Report     │ Create Pool       │ Relay Verdicts    │ Auto-Refund
       │ Pay Deposit+1%    │ Pay Fund+$1       │ Pay Gas            │ Check Expired
       ▼                   ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEXT.JS APP (Vercel)                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │   Frontend UI    │  │    API Routes    │  │    Indexer Job   │          │
│  │  - Animated bugs │  │  - /api/pools    │  │  - Sync chain    │          │
│  │  - Fee displays  │  │  - /api/reports  │  │  - Every 15s     │          │
│  │  - Wallet connect│  │  - /api/relay    │  │  - Background    │          │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
       │                   │                   │
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEON POSTGRES                                      │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │  reportbond_kv table                                         │          │
│  │  - Chain data (pools, reports, withdrawals)                  │          │
│  │  - Private data (advisory links, repo names)                 │          │
│  └──────────────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
       │
       │ Indexed from
       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ARC BLOCKCHAIN (Testnet/Mainnet)                        │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │  ReportBondWithFees Contract                                 │          │
│  │  Address: 0xc32213e7d1dc33Fc39EDA2F336cE42cE9f719995         │          │
│  │                                                              │          │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │          │
│  │  │   Pools     │  │   Reports   │  │   Credits   │          │          │
│  │  │  mapping    │  │   mapping   │  │   mapping   │          │          │
│  │  └─────────────┘  └─────────────┘  └─────────────┘          │          │
│  │                                                              │          │
│  │  Protocol Fees: 1% report + $1 pool + 2% bounty             │          │
│  └──────────────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘
```

## What Changed (This Session)

### 1. Protocol Fees Contract ✅ DEPLOYED

**Old Contract** (No Fees):
- `0x4963eCA8E60C1726CE1c123AcebF077024533d13`
- No revenue model
- Platform loses money on gas

**New Contract** (With Fees):
- `0xc32213e7d1dc33Fc39EDA2F336cE42cE9f719995`
- 1% on report submissions
- $1 on pool creation
- 2% on bounty payouts
- Sustainable revenue model

### 2. Animated UI ✅ COMPLETED

**Before**: Static emojis, no animations, basic cards
**After**:
- SVG bug icons with wiggle animations
- Smooth scroll throughout
- Flow arrows between sections
- Fade-in/slide-up page transitions
- Professional verdict tracker

### 3. Database Setup ✅ CONFIGURED

```
DATABASE_URL=postgresql://user:password@host/dbname
```
- Neon Postgres (pooled connection)
- Serverless compatible
- Auto-scaling

### 4. Build Fixed ✅ PASSING

- Removed Turbopack (was hanging)
- Fixed TypeScript errors
- Fixed ESLint errors
- 14 pages building successfully

---

## Complete User Flow

### Flow 1: Maintainer Creates Pool

```
┌─────────────┐
│ MAINTAINER  │
└──────┬──────┘
       │
       │ 1. Connect Wallet
       ▼
┌─────────────────────────────┐
│   /maintainer               │
│   "Create Bug Bounty Pool"  │
└──────┬──────────────────────┘
       │
       │ 2. Fill form:
       │    - GitHub repo (owner/repo)
       │    - Deposit amount (e.g., 5 USDC)
       │    - Response timeout (e.g., 14 days)
       │    - Max bounty per report
       │    - Initial funding
       ▼
┌─────────────────────────────┐
│   Transaction               │
│   Pay: Funding + $1 Fee     │
│   Example: 100 + 1 = 101    │
└──────┬──────────────────────┘
       │
       │ 3. Smart Contract
       ▼
┌─────────────────────────────┐
│   ReportBondWithFees        │
│   createPool()              │
│   - Protocol gets $1 fee    │
│   - Pool gets $100 funding  │
│   - Emit PoolCreated event  │
└──────┬──────────────────────┘
       │
       │ 4. Indexer syncs
       ▼
┌─────────────────────────────┐
│   Postgres Database         │
│   Pool stored for display   │
└─────────────────────────────┘
```

### Flow 2: Reporter Submits Bug

```
┌─────────────┐
│  REPORTER   │
└──────┬──────┘
       │ 
       │ 1. File vulnerability on GitHub (private advisory)
       │ 2. Copy advisory URL
       ▼
┌─────────────────────────────┐
│   /pool/[id]/report         │
│   "Submit Bug Report"       │
└──────┬──────────────────────┘
       │
       │ 3. Paste advisory URL
       │    System shows fee breakdown:
       │    - Deposit: 5.00 USDC
       │    - Fee (1%): 0.05 USDC
       │    - Total: 5.05 USDC
       ▼
┌─────────────────────────────┐
│   Transaction               │
│   Pay: 5.05 USDC            │
└──────┬──────────────────────┘
       │
       │ 4. Smart Contract
       ▼
┌─────────────────────────────┐
│   ReportBondWithFees        │
│   submitReport()            │
│   - Protocol gets 0.05 fee  │
│   - Contract holds 5.00     │
│   - Store advisory hash     │
│   - Emit ReportSubmitted    │
└──────┬──────────────────────┘
       │
       │ 5. Indexer syncs
       ▼
┌─────────────────────────────┐
│   /report/[id]              │
│   Status: "Waiting"         │
│   Deadline countdown shows  │
└─────────────────────────────┘
```

### Flow 3: Maintainer Issues Verdict

```
┌─────────────┐
│ MAINTAINER  │
└──────┬──────┘
       │
       │ 1. See report notification
       │ 2. Review vulnerability on GitHub
       ▼
┌─────────────────────────────┐
│   /maintainer/pool/[id]     │
│   Choose verdict:           │
│   ┌─────────────────────┐   │
│   │ ✓ Valid + Bounty    │   │
│   │ ↺ Honest Mistake    │   │
│   │ ✕ Slop              │   │
│   └─────────────────────┘   │
└──────┬──────────────────────┘
       │
       │ 2. Sign verdict (EIP-712)
       │    - No gas needed
       │    - Offline signature
       ▼
┌─────────────────────────────┐
│   Relayer Server            │
│   POST /api/relay/verdict   │
└──────┬──────────────────────┘
       │
       │ 3. Relayer pays gas
       ▼
┌─────────────────────────────┐
│   ReportBondWithFees        │
│   submitVerdict()           │
│                             │
│   If VALID (10 USDC bounty):│
│   - Pool pays: 10.20 USDC   │
│   - Protocol: 0.20 (2% fee) │
│   - Reporter gets: 15.00    │
│     (5 deposit + 10 bounty) │
│                             │
│   If MISTAKE:               │
│   - Reporter gets 5.00 back │
│                             │
│   If SLOP:                  │
│   - Deposit goes to pool    │
│   - Reporter loses 5.00     │
└──────┬──────────────────────┘
       │
       │ 4. Reporter withdraws
       ▼
┌─────────────────────────────┐
│   withdraw()                │
│   Reporter receives USDC    │
└─────────────────────────────┘
```

### Flow 4: Auto-Refund (No Response)

```
┌─────────────────────────────┐
│   Keeper Cron Job           │
│   Runs every hour           │
│   POST /api/cron/keeper     │
└──────┬──────────────────────┘
       │
       │ 1. Check for expired reports
       │    (deadline passed, no verdict)
       ▼
┌─────────────────────────────┐
│   Found expired report #42  │
│   Deadline: 14 days ago     │
└──────┬──────────────────────┘
       │
       │ 2. Trigger refund
       ▼
┌─────────────────────────────┐
│   ReportBondWithFees        │
│   refundExpired(42)         │
│   - Reporter gets deposit   │
│   - No fee charged          │
│   - Status: "Refunded"      │
└─────────────────────────────┘
```

---

## Backend Components

### 1. Smart Contract (`ReportBondWithFees.sol`)

```solidity
// State
mapping(uint256 => Pool) public pools;
mapping(uint256 => Report) public reports;
mapping(address => uint256) public credits;
uint256 public protocolFees;

// Fee Constants
REPORT_FEE_BPS = 100;      // 1%
POOL_CREATION_FEE = 1e18;  // 1 USDC
BOUNTY_FEE_BPS = 200;      // 2%

// Functions
createPool() → poolId
submitReport() → reportId
acknowledge()
submitVerdict()
refundExpired()
withdraw()
withdrawProtocolFees()  // Protocol owner only
```

### 2. API Routes (`app/api/`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/status` | GET | Health check, last synced block |
| `/api/pools` | GET | List all pools |
| `/api/pools/[id]` | GET | Pool details + recent reports |
| `/api/pools/[id]/repo` | POST | Set repo name |
| `/api/reports` | GET | List reports (filtered) |
| `/api/reports/[id]` | GET | Report details |
| `/api/reports/[id]/advisory` | GET | Reveal advisory link (auth) |
| `/api/relay/acknowledge` | POST | Relay acknowledgment |
| `/api/relay/verdict` | POST | Relay verdict |
| `/api/cron/keeper` | GET | Auto-refund expired reports |
| `/api/advisory/check` | POST | Validate advisory URL |

### 3. Database Schema (`lib/server/db.ts`)

```typescript
// Table: reportbond_kv
{
  key: "testnet-0xc32...:chain",
  value: {
    chainId: 5042002,
    contract: "0xc32...",
    lastBlock: 66345377,
    pools: { "1": {...}, "2": {...} },
    reports: { "1": {...}, "2": {...} },
    withdrawals: { "0xabc...": [...] }
  }
}

{
  key: "testnet-0xc32...:private",
  value: {
    advisoryLinks: { "1": "https://github.com/..." },
    repoNames: { "1": "owner/repo" }
  }
}
```

### 4. Background Jobs

**Indexer** (`jobs/indexer.ts`)
- Polls blockchain every 15 seconds
- Syncs events to Postgres
- Rebuilds if database is empty

**Keeper** (`jobs/keeper.ts`)
- Called by Vercel cron (hourly)
- Finds expired reports
- Triggers refunds automatically

---

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VERCEL                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Next.js App                                            │   │
│  │  - Serverless Functions (API routes)                    │   │
│  │  - Static Pages (/, /maintainer, /me)                   │   │
│  │  - Dynamic Pages (/pool/[id], /report/[id])            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Cron Jobs                                              │   │
│  │  - /api/cron/keeper (hourly)                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Environment Variables:                                         │
│  - NETWORK=testnet                                             │
│  - DATABASE_URL=postgresql://user:password@host/dbname              │
│  - RELAYER_PRIVATE_KEY=0x...                                   │
│  - CRON_SECRET=...                                             │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌───────────────┐      ┌───────────────┐      ┌───────────────┐
│ NEON POSTGRES │      │ ARC TESTNET   │      │ RENDER.COM    │
│               │      │               │      │ (Optional)    │
│ - Pooled conn │      │ - Contract    │      │               │
│ - Auto-scale  │      │ - USDC native │      │ - Indexer job │
│ - Free tier   │      │ - Low gas     │      │ - Background  │
└───────────────┘      └───────────────┘      └───────────────┘
```

---

## Fee Flow Summary

```
                           PROTOCOL FEES
                    ┌─────────────────────┐
                    │  protocolFees       │
                    │  (in contract)      │
                    └─────────────────────┘
                              ▲
         ┌────────────────────┼────────────────────┐
         │                    │                    │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │ 1% of   │         │ $1 flat │         │ 2% of   │
    │ deposit │         │ fee     │         │ bounty  │
    └────┬────┘         └────┬────┘         └────┬────┘
         │                   │                   │
    ┌────┴────┐         ┌────┴────┐         ┌────┴────┐
    │ Report  │         │ Pool    │         │ Valid   │
    │ Submit  │         │ Create  │         │ Verdict │
    └─────────┘         └─────────┘         └─────────┘

Monthly Revenue Projection (1000 reports/month):
- Report fees: 1000 × 1% × $5 = $50
- Pool fees: 100 pools × $1 = $100
- Bounty fees: 200 valid × 2% × $10 = $40
- TOTAL: ~$190/month (break-even)
```

---

## Files Changed/Created This Session

### New Files
| File | Purpose |
|------|---------|
| `contracts/src/ReportBondWithFees.sol` | Smart contract with protocol fees |
| `contracts/script/DeployWithFees.s.sol` | Deployment script |
| `app/components/icons.tsx` | Animated SVG bug icons |
| `app/components/FeeBreakdown.tsx` | Fee display components |
| `app/vercel.json` | Vercel configuration |
| `config/testnet-with-fees.json` | New contract config |
| `PROTOCOL_FEES.md` | Economic model documentation |
| `FEE_COMPARISON.md` | Cost analysis |
| `IMPLEMENTING_FEES.md` | Integration guide |
| `DEPLOYMENT.md` | Full deployment guide |
| `VERCEL_DEPLOY.md` | Quick deploy guide |
| `NEXT_STEPS_FEES.md` | Next steps checklist |

### Modified Files
| File | Changes |
|------|---------|
| `app/app/globals.css` | Animations (wiggle, float, pulse, dashFlow) |
| `app/app/page.tsx` | Animated icons, flow arrows, verdict tracker |
| `app/app/layout.tsx` | Lock icon SVG (removed emoji) |
| `app/components/StatusPill.tsx` | SVG icons (removed text bullets) |
| `app/components/PoolList.tsx` | Bug icon in pool badges |
| `app/components/Header.tsx` | Minimal design updates |
| `app/package.json` | Removed turbopack, added scripts |
| `.env` | Added DATABASE_URL, CRON_SECRET |
| `contracts/.env` | Added DEPLOYER_PRIVATE_KEY |

---

## Current Status

| Component | Status | Notes |
|-----------|--------|-------|
| Fee Contract | ✅ Deployed | `0xc32213e7d1dc33Fc39EDA2F336cE42cE9f719995` |
| Database | ✅ Connected | Neon Postgres pooled |
| Build | ✅ Passing | 14 pages, no errors |
| UI Animations | ✅ Complete | Bug icons, smooth scroll |
| Fee Components | ✅ Created | Ready to integrate |
| Vercel Config | ✅ Ready | vercel.json in place |
| Indexer | ⏳ Needs running | Start with `pnpm indexer` |
| Vercel Deploy | ⏳ Ready | Run `vercel --prod` |

---

## Next Steps

1. **Test fee contract** - Create pool, submit report with fees
2. **Integrate fee UI** - Add FeeBreakdown components to forms
3. **Start indexer** - `DATABASE_URL=... pnpm indexer`
4. **Deploy to Vercel** - `vercel --prod`
5. **Generate mainnet keys** - New wallets for production
6. **Deploy to mainnet** - When ready for production
