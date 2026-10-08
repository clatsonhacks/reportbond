// Storage checks for both backends: concurrent private writes are never lost, and an older chain
// sync never overwrites a newer one. Uses a throwaway "local" deployment record.
//   Files:     NETWORK=local pnpm test:db
//   Postgres:  NETWORK=local DATABASE_URL=postgres://… pnpm test:db
import "../jobs/env";
import { emptyChain, loadChain, loadPrivate, saveChain, storageKind, updatePrivate } from "../lib/server/db";
import { config } from "../lib/network";

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "  ok  " : "  FAIL"} ${name}${ok || detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
}

async function main() {
  if (config.network !== "local") throw new Error("Run with NETWORK=local; this test writes to the storage records");
  console.log(`Storage: ${storageKind}`);

  const tag = `t${Date.now()}`;
  await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      updatePrivate((d) => {
        d.advisoryLinks[`${tag}-${i}`] = `https://github.com/o/r/security/advisories/${i}`;
      }),
    ),
  );
  const links = (await loadPrivate()).advisoryLinks;
  const kept = Object.keys(links).filter((k) => k.startsWith(tag)).length;
  check("25 concurrent private writes all kept", kept === 25, kept);

  const before = await loadChain();
  const newer = { ...emptyChain(), lastBlock: before.lastBlock + 1000 };
  const older = { ...emptyChain(), lastBlock: before.lastBlock + 500 };
  await saveChain(newer);
  await saveChain(older);
  const after = (await loadChain()).lastBlock;
  if (storageKind === "postgres") {
    check("older sync does not overwrite a newer one", after === newer.lastBlock, after);
  } else {
    check("files: last write wins (single writer locally)", after === older.lastBlock, after);
  }
  await saveChain(before, true);
  check("forced save can go backwards (chain restart)", (await loadChain()).lastBlock === before.lastBlock);

  await updatePrivate((d) => {
    for (const k of Object.keys(d.advisoryLinks)) if (k.startsWith(tag)) delete d.advisoryLinks[k];
  });

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
