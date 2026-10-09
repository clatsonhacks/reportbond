#!/usr/bin/env tsx
/**
 * Pre-deployment checklist - validates environment and configuration
 * Run with: pnpm tsx scripts/check-deployment.ts
 */

import "../lib/server/env";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const checks: Array<{ name: string; check: () => boolean | string; required: boolean }> = [];
let passed = 0;
let failed = 0;

function addCheck(name: string, check: () => boolean | string, required = true) {
  checks.push({ name, check, required });
}

// Environment checks
addCheck("NETWORK is set", () => Boolean(process.env.NETWORK));
addCheck("NETWORK is testnet or mainnet", () => ["testnet", "mainnet"].includes(process.env.NETWORK ?? ""));
addCheck("DATABASE_URL is set", () => Boolean(process.env.DATABASE_URL), false);
addCheck("DATABASE_URL uses pooled connection", () => {
  const url = process.env.DATABASE_URL ?? "";
  return url.includes("pooler=true") || url.includes("pgbouncer") || url.includes("supabase") || "warning: ensure using pooled connection";
}, false);
addCheck("RELAYER_PRIVATE_KEY is set", () => Boolean(process.env.RELAYER_PRIVATE_KEY));
addCheck("RELAYER_PRIVATE_KEY is valid format", () => /^0x[0-9a-fA-F]{64}$/.test(process.env.RELAYER_PRIVATE_KEY ?? ""));
addCheck("CRON_SECRET is set", () => Boolean(process.env.CRON_SECRET), false);
addCheck("CRON_SECRET is strong", () => (process.env.CRON_SECRET?.length ?? 0) >= 32, false);

// Config file checks
const network = process.env.NETWORK ?? "testnet";
const configPath = path.join(process.cwd(), "..", "config", `${network}.json`);
addCheck(`config/${network}.json exists`, () => existsSync(configPath));
addCheck(`config/${network}.json is valid JSON`, () => {
  try {
    if (!existsSync(configPath)) return false;
    const content = readFileSync(configPath, "utf8");
    const config = JSON.parse(content);
    const deployed = /^0x[0-9a-fA-F]{40}$/.test(config.contractAddress ?? "") && !/^0x0{40}$/.test(config.contractAddress);
    return deployed && Number(config.deployBlock) > 0;
  } catch {
    return false;
  }
});

// Vercel config check
const vercelPath = path.join(process.cwd(), "vercel.json");
addCheck("vercel.json exists", () => existsSync(vercelPath), false);

console.log("\n🔍 ReportBond Deployment Checklist\n");
console.log("━".repeat(60));

for (const { name, check, required } of checks) {
  const result = check();
  const isPass = result === true;
  const isWarning = typeof result === "string";

  if (isPass) {
    console.log(`✅ ${name}`);
    passed++;
  } else if (isWarning) {
    console.log(`⚠️  ${name}: ${result}`);
    passed++;
  } else {
    console.log(`${required ? "❌" : "⚠️ "} ${name}`);
    if (required) failed++;
  }
}

console.log("━".repeat(60));
console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log("❌ Deployment checks failed. Please fix the issues above.\n");
  console.log("Quick fixes:");
  console.log("  • Set missing environment variables in .env file");
  console.log(`  • Ensure config/${network}.json has contractAddress and deployBlock`);
  console.log("  • For Vercel, set variables in project settings\n");
  process.exit(1);
}

console.log("✅ All required checks passed! Ready for deployment.\n");

if (!process.env.DATABASE_URL) {
  console.log("ℹ️  DATABASE_URL not set - will use local JSON files");
  console.log("   For production deployment, add DATABASE_URL to Vercel environment variables\n");
}

console.log("Next steps:");
console.log("  1. Deploy to Vercel: vercel --prod");
console.log("  2. Start indexer: pnpm indexer");
console.log("  3. Check status: curl https://your-app.vercel.app/api/status\n");
