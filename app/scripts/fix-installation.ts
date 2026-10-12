// Quick fix script to update the stale installation ID for a pool
// Run with: npx tsx scripts/fix-installation.ts

import { loadGithub, updateGithub } from "../lib/server/db";

const POOL_ID = "8";

async function main() {
  const gh = await loadGithub();

  console.log("Current verifiedPools:", JSON.stringify(gh.verifiedPools, null, 2));

  const verified = gh.verifiedPools[POOL_ID];
  if (!verified) {
    console.log(`Pool ${POOL_ID} is not verified.`);
    return;
  }

  console.log(`\nPool ${POOL_ID} current installation ID: ${verified.installationId}`);
  console.log(`Repo: ${verified.repo}`);

  // To find your current installation ID:
  // 1. Go to https://github.com/settings/installations
  // 2. Click "Configure" on the ReportBond app
  // 3. Look at the URL - it ends with the installation ID
  //    e.g., https://github.com/settings/installations/12345678

  const NEW_INSTALLATION_ID = process.argv[2];

  if (!NEW_INSTALLATION_ID) {
    console.log("\nTo fix, run:");
    console.log("  npx tsx scripts/fix-installation.ts <NEW_INSTALLATION_ID>");
    console.log("\nTo find your installation ID:");
    console.log("  1. Go to https://github.com/settings/installations");
    console.log("  2. Click 'Configure' on the ReportBond app");
    console.log("  3. The URL ends with the installation ID");
    return;
  }

  const newId = parseInt(NEW_INSTALLATION_ID, 10);
  if (isNaN(newId)) {
    console.log("Invalid installation ID:", NEW_INSTALLATION_ID);
    return;
  }

  await updateGithub((g) => {
    g.verifiedPools[POOL_ID].installationId = newId;
  });

  console.log(`\n✓ Updated pool ${POOL_ID} installation ID to ${newId}`);
  console.log("Restart your dev server and try again.");
}

main().catch(console.error);
