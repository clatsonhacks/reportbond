# ✅ Fee Contract Deployed - Next Steps

## What Just Happened

Your ReportBondWithFees contract is now **live on Arc testnet**:
- Address: `0xc32213e7d1dc33Fc39EDA2F336cE42cE9f719995`
- Block: `66345377`
- [View on Arcscan](https://testnet.arcscan.app/address/0xc32213e7d1dc33Fc39EDA2F336cE42cE9f719995)

## Test the Fee Contract (Testnet)

### Step 1: Point Your App to the New Contract

**Option A: Temporary switch (testing)**
```bash
cd app
# Edit lib/network.ts or use environment variable
NEXT_PUBLIC_CONTRACT_ADDRESS=0xc32213e7d1dc33Fc39EDA2F336cE42cE9f719995 pnpm dev
```

**Option B: Update config (permanent)**
Replace `config/testnet.json` with the new address:
```json
{
  "address": "0xc32213e7d1dc33Fc39EDA2F336cE42cE9f719995",
  "deployBlock": 66345377
}
```

### Step 2: Update Frontend to Show Fees

The contract has fees, but your UI doesn't show them yet. Add fee displays:

**Quick Test (No UI changes):**
Just try creating a pool - you'll need to send extra USDC for the fee.

**Proper Integration (Recommended):**
Follow [IMPLEMENTING_FEES.md](./IMPLEMENTING_FEES.md) to add fee breakdown components.

### Step 3: Test the Flows

1. **Create Pool** (should cost deposit + 1 USDC fee)
   ```bash
   # If pool requires 100 USDC funding
   # You'll pay: 100 + 1 = 101 USDC
   ```

2. **Submit Report** (should cost deposit + 1% fee)
   ```bash
   # If pool requires 5 USDC deposit
   # You'll pay: 5.00 + 0.05 = 5.05 USDC
   ```

3. **Pay Bounty** (should deduct 2% fee from pool)
   ```bash
   # If bounty is 10 USDC
   # Pool pays: 10 + 0.20 = 10.20 USDC
   # Reporter gets: 10 USDC
   ```

4. **Check Protocol Fees**
   ```bash
   cast call 0xc32213e7d1dc33Fc39EDA2F336cE42cE9f719995 "protocolFees()(uint256)" \
     --rpc-url https://rpc.drpc.testnet.arc.network
   ```

5. **Withdraw Fees (as protocol owner)**
   ```bash
   cast send 0xc32213e7d1dc33Fc39EDA2F336cE42cE9f719995 "withdrawProtocolFees()" \
     --private-key 0xad5236116c8e3762ffb3ed595410ccbcf42655796b606b72a183257c84ed2832 \
     --rpc-url https://rpc.drpc.testnet.arc.network
   ```

## Deploy to Mainnet (When Ready)

### ⚠️ CRITICAL: Generate New Keys for Mainnet

**NEVER reuse testnet keys on mainnet!**

```bash
# Generate new deployer wallet
cast wallet new

# Save output securely:
# Address: 0x...
# Private Key: 0x...

# Generate new protocol owner (or use multisig)
cast wallet new

# Fund deployer with mainnet USDC for gas
# Get from: https://app.uniswap.org (bridge to Arc)
```

### Mainnet Deployment Steps

1. **Update contracts/.env**
   ```bash
   DEPLOYER_PRIVATE_KEY=0x... # Your NEW mainnet key
   ```

2. **Deploy to mainnet**
   ```bash
   cd contracts
   forge script script/DeployWithFees.s.sol \
     --rpc-url https://rpc.mainnet.arc.network \
     --broadcast \
     --verify
   ```

3. **Update config/mainnet.json**
   ```json
   {
     "address": "0x...",
     "deployBlock": 12345678
   }
   ```

4. **Update Vercel Environment Variables**
   ```bash
   NETWORK=mainnet
   # Keep DATABASE_URL, RELAYER_PRIVATE_KEY, CRON_SECRET same
   ```

5. **Deploy frontend to Vercel**
   ```bash
   cd app
   vercel --prod
   ```

## Compare Old vs New Contract

| Feature | Old Contract (No Fees) | New Contract (With Fees) |
|---------|------------------------|--------------------------|
| Address (testnet) | `0x4963eCA8E60C1726CE1c123AcebF077024533d13` | `0xc32213e7d1dc33Fc39EDA2F336cE42cE9f719995` |
| Pool creation cost | Funding amount | Funding + 1 USDC |
| Report submission cost | Exact deposit | Deposit + 1% |
| Bounty payout cost | Exact bounty | Bounty + 2% |
| Revenue for platform | $0 | ~$19/month at 100 reports |
| Sustainability | ❌ Loses money | ✅ Covers costs |

## Recommended Path

### Path A: Start with Fees (Recommended)
1. ✅ Test fee contract on testnet (you just deployed it!)
2. Integrate fee UI components
3. Test with real wallet flows
4. Deploy to mainnet with fees from day 1
5. Build user base with sustainable model

### Path B: Start Without Fees, Add Later
1. Deploy old contract (no fees) to mainnet
2. Build user base
3. Announce fee structure
4. Deploy new contract with fees
5. Migrate users (pain point!)

**Path A is cleaner** - users expect fees from the start.

## Questions?

- **"Will users accept fees?"** → Yes, if you're transparent. Your fees are 90% cheaper than HackerOne.
- **"Should I lower fees?"** → Start at 1-2%, measure costs, adjust after 3 months.
- **"What if I don't break even?"** → Either increase fees slightly or reduce infrastructure costs.
- **"Can I change fees later?"** → No, fees are immutable. You'd need to deploy a new contract.

## Next Actions

Choose one:

**A. Test fees thoroughly first** (Recommended)
```bash
cd app
# Update to use new contract address
# Test pool creation, report submission, bounty payouts
# Verify fees are collected correctly
```

**B. Keep testing without fees**
```bash
# Continue using old contract (0x4963...)
# Plan mainnet launch with fees from day 1
```

**C. Deploy to mainnet now**
```bash
# ⚠️ Make sure you understand the fees first!
# Generate new keys, fund deployer, deploy contract
```

I recommend **Option A** - test the fee flows on testnet first to make sure everything works as expected!

---

**Current Status:**
✅ Fee contract deployed to testnet
✅ Old contract still working (no fees)
⏳ Need to update frontend to show fees
⏳ Test fee flows thoroughly
⏳ Generate mainnet keys
⏳ Deploy to mainnet

**Cost to deploy to mainnet:** ~0.1 USDC (gas fees)
**Time to test:** ~30 minutes
**Time to integrate UI:** ~2 hours

Take your time testing - mainnet is permanent!
