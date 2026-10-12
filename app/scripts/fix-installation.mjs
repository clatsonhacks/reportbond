// Quick fix script to update the stale installation ID for a pool
// Run with: node scripts/fix-installation.mjs <NEW_INSTALLATION_ID>
//
// This script works with file-based storage (.data folder).
// For Postgres, you'll need to run SQL directly.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const POOL_ID = "8";
const deployment = process.env.NETWORK || "local";
const dir = path.join(process.cwd(), ".data");
const file = path.join(dir, `${deployment}.github.json`);

console.log(`Looking for: ${file}`);

if (!existsSync(file)) {
  console.log("\nFile not found. You might be using Postgres storage.");
  console.log("\nFor Postgres, run this SQL:");
  console.log(`
UPDATE reportbond_kv
SET value = jsonb_set(
  value,
  '{verifiedPools,${POOL_ID},installationId}',
  '<NEW_INSTALLATION_ID>'
)
WHERE key = 'github';
  `);
  console.log("\nReplace <NEW_INSTALLATION_ID> with your actual installation ID.");
  console.log("Find it at: https://github.com/settings/installations (click Configure, check URL)");
  process.exit(1);
}

const data = JSON.parse(readFileSync(file, "utf8"));
console.log("\nCurrent verifiedPools:", JSON.stringify(data.verifiedPools, null, 2));

const verified = data.verifiedPools?.[POOL_ID];
if (!verified) {
  console.log(`\nPool ${POOL_ID} is not verified in this file.`);
  process.exit(1);
}

console.log(`\nPool ${POOL_ID} current installation ID: ${verified.installationId}`);

const NEW_INSTALLATION_ID = process.argv[2];

if (!NEW_INSTALLATION_ID) {
  console.log("\nTo fix, run:");
  console.log("  node scripts/fix-installation.mjs <NEW_INSTALLATION_ID>");
  console.log("\nTo find your installation ID:");
  console.log("  1. Go to https://github.com/settings/installations");
  console.log("  2. Click 'Configure' on the ReportBond app");
  console.log("  3. The URL ends with the installation ID");
  process.exit(0);
}

const newId = parseInt(NEW_INSTALLATION_ID, 10);
if (isNaN(newId)) {
  console.log("Invalid installation ID:", NEW_INSTALLATION_ID);
  process.exit(1);
}

data.verifiedPools[POOL_ID].installationId = newId;
writeFileSync(file, JSON.stringify(data, null, 2));

console.log(`\n✓ Updated pool ${POOL_ID} installation ID to ${newId}`);
console.log("Restart your dev server and try again.");
