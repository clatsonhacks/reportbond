# ReportBond - Vercel Deployment Guide

Complete step-by-step guide to deploy ReportBond on Vercel with Postgres.

## Prerequisites

- GitHub account
- Vercel account (free tier works)
- Postgres database (Neon recommended - free tier available)

## Step 1: Database Setup (Neon Postgres)

1. Go to [Neon Console](https://console.neon.tech/)
2. Create a new project
3. Copy the **pooled connection string** (important for serverless compatibility)
   - Should look like: `postgres://user:password@host:5432/database?sslmode=require&pooler=true`
   - The `pooler=true` parameter is crucial for Vercel serverless functions

**Alternative**: Vercel Postgres or Supabase also work fine.

## Step 2: Generate Secrets

### Relayer Wallet
You need a wallet with a small amount of USDC for gas fees (1-2 USDC on testnet):

```bash
# Option 1: Use an existing wallet (NOT your personal wallet)
# Export private key from MetaMask or another wallet

# Option 2: Generate a new wallet
# Use: https://vanity-eth.tk/ or run:
node -e "const { Wallet } = require('ethers'); console.log(Wallet.createRandom().privateKey)"
```

Fund this wallet with 1-2 USDC from https://faucet.circle.com (Arc Testnet)

### Cron Secret
Generate a random secret for cron job authentication:

```bash
openssl rand -hex 32
# Or use: https://randomkeygen.com/
```

## Step 3: Deploy to Vercel

### 3.1 Import Repository

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New" → "Project"
3. Import your ReportBond repository
4. **Important**: Set **Root Directory** to `app`
5. Keep "Include files outside the root directory" checked
   - This allows the app to read `config/*.json` files

### 3.2 Configure Environment Variables

In Vercel project settings → Environment Variables, add:

| Variable | Value | Notes |
|----------|-------|-------|
| `NETWORK` | `testnet` | Use `mainnet` when ready for production |
| `DATABASE_URL` | `postgres://...` | Your **pooled** Postgres connection string |
| `RELAYER_PRIVATE_KEY` | `0x...` | Private key of wallet with gas money |
| `CRON_SECRET` | `your-random-secret` | Random 64-character hex string |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | `optional` | From cloud.reown.com for mobile wallets |

**Set these for both Production and Preview environments.**

### 3.3 Deploy

Click "Deploy" and wait for the build to complete.

## Step 4: Run the Indexer

The indexer syncs blockchain data to your database. It needs to run continuously.

### Option A: Local Machine (Development/Testing)

Run on your computer while testing:

```bash
cd app
DATABASE_URL="your-postgres-url" NETWORK=testnet pnpm indexer
```

Keep this terminal window open. The indexer will run every 15 seconds.

### Option B: Vercel Background Job (Recommended for Production)

Since Vercel added cron support, you can use it for the keeper job. For the continuous indexer, you have two options:

**Option 1: Use Render.com Background Worker (Free)**

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Create a new "Background Worker"
3. Connect your GitHub repository
4. Configuration:
   - **Name**: `reportbond-indexer`
   - **Root Directory**: `app`
   - **Build Command**: `pnpm install`
   - **Start Command**: `pnpm indexer`
   - **Instance Type**: Free
5. Add environment variables:
   - `DATABASE_URL`: Your Postgres connection string
   - `NETWORK`: `testnet`

**Option 2: Railway.app Background Service**

1. Go to [Railway.app](https://railway.app/)
2. Create new project from GitHub repo
3. Configuration:
   - **Root Directory**: `app`
   - **Build Command**: `pnpm install`
   - **Start Command**: `pnpm indexer`
4. Add environment variables (same as above)

**Option 3: Keep it running locally**

For development, just keep the indexer running on your computer.

## Step 5: Verify Deployment

1. Visit your Vercel URL (e.g., `https://reportbond-xyz.vercel.app`)
2. Check `/api/status`:
   ```bash
   curl https://your-app.vercel.app/api/status
   ```

   Should return:
   ```json
   {
     "network": "testnet",
     "deployed": true,
     "storage": "postgres",
     "lastBlock": 123456789
   }
   ```

3. Verify `storage` is `"postgres"` (not `"files"`)
4. Check that `lastBlock` is recent (should be close to current Arc testnet block)

## Step 6: Test the App

1. Connect your wallet (MetaMask with Arc Testnet)
2. Get test USDC: https://faucet.circle.com
3. Try creating a pool from the maintainer console
4. Submit a test report

## Troubleshooting

### "Storage is 'files' instead of 'postgres'"
- DATABASE_URL is not set correctly in Vercel environment variables
- Make sure it's set for the correct environment (Production/Preview)
- Redeploy after adding the variable

### "Contract not deployed"
- Check that `config/testnet.json` has the correct contract address
- Verify NETWORK environment variable is set correctly

### "Indexer not running / lastBlock is 0"
- The indexer background job is not running
- Start the indexer using one of the options in Step 4
- Check indexer logs for errors

### Build fails
- Make sure Root Directory is set to `app` in Vercel
- Ensure "Include files outside root directory" is checked
- Check build logs for specific error messages

### Transactions failing
- Relayer wallet needs USDC for gas (check balance on Arcscan)
- Fund from https://faucet.circle.com

## Production Checklist

Before going to mainnet:

- [ ] Generate NEW wallet for production relayer (never reuse testnet keys)
- [ ] Fund relayer wallet with mainnet USDC for gas
- [ ] Deploy contract to mainnet
- [ ] Update `config/mainnet.json` with address and block
- [ ] Set `NETWORK=mainnet` in Vercel environment variables
- [ ] Update DATABASE_URL to production database
- [ ] Generate new CRON_SECRET for production
- [ ] Test thoroughly on testnet first
- [ ] Set up monitoring and alerts
- [ ] Consider running indexer on a dedicated server for reliability

## Monitoring

Set up monitoring to ensure the indexer is running:

1. **Database Checks**: Query `reportbond_kv` table to see `lastBlock` timestamp
2. **Health Endpoint**: Monitor `/api/status` endpoint
3. **Indexer Logs**: Check your background worker logs (Render/Railway)
4. **Alerts**: Set up alerts if `lastBlock` hasn't updated in 5+ minutes

## Cost Estimate

**Free Tier (Development/Testing)**:
- Vercel: Free (Hobby plan)
- Neon Postgres: Free (0.5 GB storage, 3 GB transfer)
- Render Background Worker: Free
- Total: **$0/month**

**Production (Recommended)**:
- Vercel Pro: $20/month (better performance, team features)
- Neon Scale: $19/month (more storage, better performance)
- Render Starter: $7/month (always-on background worker)
- Total: **~$46/month**

## Support

- Issues: https://github.com/clatsonhacks/reportbond/issues
- Arc Testnet Explorer: https://testnet.arcscan.app
- Arc Testnet Faucet: https://faucet.circle.com
