// Fix stale installation ID in Postgres
// Run with: node scripts/fix-installation-pg.mjs <NEW_INSTALLATION_ID>

import postgres from "postgres";

const POOL_ID = "8";
const NEW_INSTALLATION_ID = process.argv[2];

if (!NEW_INSTALLATION_ID) {
  console.log("Usage: node scripts/fix-installation-pg.mjs <NEW_INSTALLATION_ID>");
  console.log("\nTo find your installation ID:");
  console.log("  1. Go to https://github.com/settings/installations");
  console.log("  2. Click 'Configure' on the ReportBond app");
  console.log("  3. The URL ends with the installation ID");
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log("ERROR: DATABASE_URL environment variable not set.");
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

try {
  // The correct key format based on what we found
  const githubKey = "testnet-0x4963eca8e60c1726ce1c123acebf077024533d13:github";

  console.log(`Looking for key: '${githubKey}'`);

  const [row] = await sql`SELECT key, value FROM reportbond_kv WHERE key = ${githubKey}`;

  if (!row) {
    console.log("Record not found!");
    process.exit(1);
  }

  console.log(`Found record with key: '${row.key}'`);
  const data = row.value;

  console.log("\nverifiedPools:", JSON.stringify(data.verifiedPools, null, 2));

  const verified = data.verifiedPools?.[POOL_ID];
  if (!verified) {
    console.log(`\nPool ${POOL_ID} is not in verifiedPools.`);
    console.log("Available pools:", Object.keys(data.verifiedPools || {}));
    process.exit(1);
  }

  console.log(`\nCurrent installation ID: ${verified.installationId}`);
  console.log(`Updating to: ${NEW_INSTALLATION_ID}`);

  // Update the installation ID
  const newId = parseInt(NEW_INSTALLATION_ID, 10);
  data.verifiedPools[POOL_ID].installationId = newId;

  await sql`
    UPDATE reportbond_kv
    SET value = ${sql.json(data)}, updated_at = now()
    WHERE key = ${githubKey}
  `;

  console.log(`\n✓ Updated pool ${POOL_ID} installation ID to ${NEW_INSTALLATION_ID}`);
  console.log("Restart your dev server and try again.");

} catch (e) {
  console.error("Error:", e.message);
  console.error(e);
} finally {
  await sql.end();
}
