// Secrets live in the repo-root .env (shared with contracts/ and jobs). Next only reads app/.env,
// so server modules that need secrets import this first. Variables already set always win.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const file = path.resolve(process.cwd(), "..", ".env");
if (existsSync(file)) {
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
