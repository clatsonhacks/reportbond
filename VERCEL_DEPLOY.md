# 🚀 Quick Vercel Deployment

Fast-track guide to deploy ReportBond on Vercel in under 10 minutes.

## 1️⃣ One-Click Database Setup

**Use Neon (Recommended - Free)**
1. Go to https://console.neon.tech/signup
2. Create account → Create first project
3. Copy the **Connection string** (click "Pooled connection")
4. Save it - you'll need it in step 3

## 2️⃣ Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fclatsonhacks%2Freportbond&root-directory=app)

Or manually:
1. Go to https://vercel.com/new
2. Import your ReportBond repository
3. **Important**: Set Root Directory to `app`
4. Check "Include files outside root directory"
5. Don't deploy yet - add environment variables first

## 3️⃣ Environment Variables

In Vercel project settings → Environment Variables:

### Minimum Required (Testnet)
```bash
NETWORK=testnet
DATABASE_URL=your-neon-postgres-url-here
RELAYER_PRIVATE_KEY=0xad5236116c8e3762ffb3ed595410ccbcf42655796b606b72a183257c84ed2832
CRON_SECRET=your-random-secret-here
```

**Generate CRON_SECRET:**
```bash
openssl rand -hex 32
```

**Quick Start**: Use the testnet `RELAYER_PRIVATE_KEY` above for testing (already funded with gas)

### Optional
```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your-wc-project-id
```

Add these to **both Production and Preview** environments.

## 4️⃣ Deploy

Click "Deploy" in Vercel. Wait ~2 minutes for build.

## 5️⃣ Start the Indexer

The indexer syncs blockchain data. Choose one option:

### Option A: Local (Quick Test)
```bash
cd app
DATABASE_URL="your-postgres-url" NETWORK=testnet pnpm indexer
```

Keep this running in a terminal.

### Option B: Render.com (Free Background Worker)
1. Go to https://dashboard.render.com/
2. New → Background Worker
3. Connect GitHub repo
4. Settings:
   - Root Directory: `app`
   - Build Command: `pnpm install`
   - Start Command: `pnpm indexer`
5. Add environment variables:
   - `DATABASE_URL`: Your Postgres URL
   - `NETWORK`: `testnet`
6. Create Web Service

## 6️⃣ Verify

Check your deployment:
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

✅ `storage` should be `"postgres"` (not `"files"`)
✅ `lastBlock` should be a recent number

## 7️⃣ Test the App

1. Visit your Vercel URL
2. Connect wallet (MetaMask with Arc Testnet)
3. Get test USDC: https://faucet.circle.com
4. Create a pool or submit a report

## 🎉 Done!

Your ReportBond instance is live on testnet.

## Common Issues

**"Storage is files instead of postgres"**
→ DATABASE_URL not set in Vercel. Add it and redeploy.

**"lastBlock is 0"**
→ Indexer not running. Start it using Option A or B above.

**Build fails**
→ Check Root Directory is set to `app` in Vercel settings.

**Can't connect wallet**
→ Make sure you're on Arc Testnet in MetaMask.

## Next Steps

- [ ] Test creating a pool
- [ ] Test submitting a report
- [ ] Set up monitoring for the indexer
- [ ] Plan mainnet deployment

## Production Deployment

When ready for mainnet:
1. Generate NEW relayer wallet (never reuse testnet keys)
2. Deploy contract to mainnet
3. Update `config/mainnet.json`
4. Set `NETWORK=mainnet` in Vercel
5. Fund relayer with real USDC for gas

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full production guide.

## Need Help?

- Full guide: [DEPLOYMENT.md](./DEPLOYMENT.md)
- Issues: https://github.com/clatsonhacks/reportbond/issues
- Arc Testnet: https://testnet.arcscan.app
- Test USDC Faucet: https://faucet.circle.com
