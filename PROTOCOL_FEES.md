# Protocol Fees - Economic Model

## Why Protocol Fees?

On mainnet, ReportBond requires revenue to cover:
- ⛽ **Relayer gas costs** - Every verdict/acknowledgment costs gas
- 🗄️ **Infrastructure** - Database (Postgres), hosting (Vercel), indexer
- 🔧 **Development** - Ongoing maintenance and security updates
- 📊 **Monitoring** - Uptime checks, error tracking

Without fees, you'll **lose money** on every transaction.

## Fee Structure

### 1. Report Submission Fee: 1%
- **Who pays**: Reporter
- **When**: When submitting a report
- **Amount**: 1% of deposit amount
- **Example**:
  - Pool requires 5 USDC deposit
  - Reporter pays: 5.00 + 0.05 = **5.05 USDC**
  - Protocol keeps: 0.05 USDC
  - Contract holds: 5.00 USDC (refundable)

### 2. Pool Creation Fee: 1 USDC (flat)
- **Who pays**: Maintainer
- **When**: Creating a new bug bounty pool
- **Amount**: 1 USDC flat fee
- **Example**:
  - Maintainer wants to fund pool with 100 USDC
  - Sends: 101 USDC total
  - Protocol keeps: 1 USDC
  - Pool starts with: 100 USDC available

### 3. Bounty Fee: 2%
- **Who pays**: Pool (indirectly: maintainer)
- **When**: Valid report paid out
- **Amount**: 2% of bounty amount
- **Example**:
  - Valid report earns 10 USDC bounty
  - Pool pays: 10.00 + 0.20 = 10.20 USDC total
  - Reporter gets: 5.00 (deposit) + 10.00 (bounty) = **15.00 USDC**
  - Protocol keeps: 0.20 USDC
  - Pool balance decreased by: 10.20 USDC

## Revenue Projections

### Conservative (10 pools, 50 reports/month)
```
Pool creations:     10 × $1.00     = $10/month
Report submissions: 50 × $0.05     = $2.50/month (assuming $5 deposits)
Bounty payouts:     10 × 2% × $10  = $2/month (20% valid rate, $10 avg bounty)
                                     ─────────────
                                     $14.50/month
```

### Moderate (50 pools, 500 reports/month)
```
Pool creations:     50 × $1.00      = $50/month
Report submissions: 500 × $0.05     = $25/month
Bounty payouts:     100 × 2% × $10  = $20/month
                                      ─────────────
                                      $95/month
```

### High Usage (200 pools, 2000 reports/month)
```
Pool creations:     200 × $1.00       = $200/month
Report submissions: 2000 × $0.05      = $100/month
Bounty payouts:     400 × 2% × $15    = $120/month
                                        ─────────────
                                        $420/month
```

## Cost Breakdown (Mainnet Operations)

### Monthly Costs
- **Vercel Pro**: $20/month (serverless hosting)
- **Neon Postgres**: $19/month (managed database)
- **Render Background Worker**: $7/month (indexer)
- **Relayer Gas**: ~$50-100/month (depends on volume)
  - Arc mainnet gas is cheap (~$0.01-0.10 per transaction)
  - At 500 verdicts/month: ~$5-50 in gas
- **Monitoring**: $10/month (Sentry, uptime monitoring)
- **Domain**: $12/year (~$1/month)

**Total Operating Costs**: ~$107-157/month

**Break-even**: ~200 reports/month with current fee structure

## Fee Comparison (Industry Standards)

| Platform | Report Fee | Pool Fee | Bounty Fee |
|----------|-----------|----------|------------|
| **ReportBond** | 1% | 1 USDC | 2% |
| Immunefi | 0% | 0% | 10% |
| HackerOne | 0% | ~$500/month | 20% |
| Bugcrowd | 0% | ~$1000/month | 20-30% |
| Code4rena | 0% | Competition-based | 10% |

**Our fees are extremely competitive** - we charge less than 1/10th of traditional platforms.

## Adjusting Fees

Fees are hardcoded in the contract but can be changed for future deployments:

```solidity
// In ReportBondWithFees.sol
uint256 public constant REPORT_FEE_BPS = 100;      // 1% (100 basis points)
uint256 public constant POOL_CREATION_FEE = 1e18;  // 1 USDC
uint256 public constant BOUNTY_FEE_BPS = 200;      // 2% (200 basis points)
```

## Implementation Steps

### 1. Deploy New Contract
```bash
cd contracts
forge script script/DeployWithFees.s.sol --rpc-url https://rpc.mainnet.arc.network \
  --private-key $DEPLOYER_PRIVATE_KEY --broadcast
```

### 2. Update Frontend
- Display fees prominently in UI
- Show total cost before transactions
- Update pool creation flow
- Update report submission flow

### 3. Update Documentation
- README: mention protocol fees
- Landing page: fee transparency
- FAQ: explain fee structure

### 4. Withdraw Fees
Protocol owner can withdraw accumulated fees:
```solidity
// As protocol owner
reportBond.withdrawProtocolFees();
```

## Fee Transparency

All protocol fees are:
- ✅ **On-chain**: Every fee is logged in events
- ✅ **Predictable**: Fixed percentages, no surprises
- ✅ **Fair**: Much lower than industry standards
- ✅ **Sustainable**: Cover operating costs only
- ✅ **Transparent**: Open source contract code

## Alternative Models

If fees are too high for users, consider:

### Model A: Lower Fees, Higher Volume
- Report fee: 0.5% (instead of 1%)
- Pool fee: 0.5 USDC (instead of 1 USDC)
- Bounty fee: 1.5% (instead of 2%)
- Need 2x volume to break even

### Model B: Freemium
- First 10 reports free per wallet
- Then 1% fee applies
- Encourages trial, builds user base

### Model C: Subscription
- Maintainers pay monthly ($10-50)
- Unlimited reports in their pools
- No per-transaction fees
- Predictable revenue

### Model D: Hybrid
- No report submission fee (attract reporters)
- Higher bounty fee (3-5%) to compensate
- Pool creation remains at 1 USDC

## Recommended: Start Conservative

**For Launch**: Use the fees as defined
- 1% report fee
- 1 USDC pool fee
- 2% bounty fee

**After 3 months**: Analyze data
- What's the actual volume?
- What are real gas costs?
- User feedback on fees?
- Adjust accordingly

**Goal**: Sustainable > Profitable
- Cover costs first
- Build user base second
- Optimize fees third

## Questions?

- Lower fees = need more volume
- Higher fees = might deter users
- **Sweet spot**: Just enough to sustain operations

Start conservative, measure everything, adjust based on data.
