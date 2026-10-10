// Grounding check: does the code a report cites actually exist?
// Fabricated reports routinely name files, lines and functions that aren't in the repository, and this
// needs no model to detect. Pure functions here; the repository lookups are passed in.
import type { Grounding, GroundingItem } from "./rules";

export type References = {
  paths: string[];
  /** path plus the highest line number cited for it. */
  lines: { path: string; line: number }[];
  symbols: string[];
};

const CODE_EXT =
  "c|h|cc|cpp|cxx|hpp|hh|py|js|jsx|mjs|cjs|ts|tsx|go|rs|java|kt|kts|rb|php|cs|swift|m|mm|sol|vy|sh|bash|ps1|pl|lua|scala|ex|exs|erl|hs|ml|sql|yml|yaml|json|toml|xml|html|css|scss|md|txt|cfg|conf|ini|proto|gradle|cmake|mk|tf";
// A path with at least one slash and an extension, or a bare file name with a code extension.
const PATH_RE = new RegExp(`(?:[\\w.@+-]+/)+[\\w.@+-]+\\.[A-Za-z0-9]{1,8}|\\b[\\w@+-]+\\.(?:${CODE_EXT})\\b`, "g");
const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
// Names that appear in almost any report and say nothing about this repository.
const COMMON = new Set(
  "if for while switch return sizeof main printf sprintf snprintf fprintf malloc calloc realloc free memcpy memmove memset strlen strcpy strncpy strcat strcmp open close read write exit assert print println console log error warn require import include define typeof alert eval exec system fetch then catch map filter reduce push pop join split slice len range str int float bool list dict set tuple new delete this self super void null true false function class def fn func var let const struct enum test describe it expect curl echo cat grep sudo chmod pip npm node python get post put patch".split(
    " ",
  ),
);

function looksLikeDomain(path: string): boolean {
  const first = path.split("/")[0];
  return /\.(com|org|net|io|dev|app|ai|co|gov|edu)$/i.test(first);
}

/** Pulls file paths, line numbers and code identifiers out of free text. */
export function extractReferences(text: string): References {
  const clean = text.replace(URL_RE, " ");
  const paths = new Set<string>();
  const lineOf = new Map<string, number>();

  for (const m of clean.matchAll(PATH_RE)) {
    const p = m[0].replace(/^\.\//, "").replace(/[.,;:)]+$/, "");
    if (looksLikeDomain(p) || /^\d+(\.\d+)+$/.test(p) || /^v?\d+\.\d+/.test(p.split("/").pop()!)) continue;
    paths.add(p);
    // "path:123", "path#L123", "path line 123", "path, lines 10-20"
    const after = clean.slice(m.index! + m[0].length, m.index! + m[0].length + 24);
    const ln = after.match(/^(?::|#L|,?\s+lines?\s+|\s*\(lines?\s+)(\d{1,6})(?:\s*[-–]\s*L?(\d{1,6}))?/i);
    if (ln) lineOf.set(p, Math.max(lineOf.get(p) ?? 0, Number(ln[2] ?? ln[1])));
  }
  // "line 123 of path"
  for (const m of clean.matchAll(/\blines?\s+(\d{1,6})(?:\s*[-–]\s*(\d{1,6}))?\s+(?:of|in)\s+`?([\w./@+-]+\.[A-Za-z0-9]{1,8})/gi)) {
    const p = m[3].replace(/^\.\//, "");
    if (looksLikeDomain(p)) continue;
    paths.add(p);
    lineOf.set(p, Math.max(lineOf.get(p) ?? 0, Number(m[2] ?? m[1])));
  }

  const symbols = new Set<string>();
  const consider = (name: string) => {
    const base = name.split(/::|\.|->/).pop()!;
    if (base.length < 4 || COMMON.has(base.toLowerCase()) || /^\d/.test(base)) return;
    // Only names that look like code: snake_case, camelCase, PascalCase with an inner capital, or qualified.
    if (/_/.test(base) || /[a-z][A-Z]/.test(base) || /::|->/.test(name)) symbols.add(base);
  };
  for (const m of clean.matchAll(/([A-Za-z_][\w]*(?:(?:::|->|\.)[A-Za-z_][\w]*)*)\s*\(/g)) consider(m[1]);
  for (const m of clean.matchAll(/`([A-Za-z_][\w]*(?:(?:::|->|\.)[A-Za-z_][\w]*)*)(?:\(\))?`/g)) consider(m[1]);

  return {
    paths: [...paths].slice(0, 30),
    lines: [...lineOf.entries()].map(([path, line]) => ({ path, line })).slice(0, 30),
    symbols: [...symbols].filter((s) => ![...paths].some((p) => p.includes(s))).slice(0, 20),
  };
}

/** The repository file a cited path refers to: exact, a unique suffix match, or a unique file name. */
export function resolvePath(ref: string, tree: string[]): string | null {
  if (tree.includes(ref)) return ref;
  const lower = ref.toLowerCase();
  const suffix = tree.filter((p) => p.toLowerCase() === lower || p.toLowerCase().endsWith(`/${lower}`));
  if (suffix.length >= 1 && (ref.includes("/") || suffix.length === 1)) return suffix[0];
  return null;
}

export type Lookups = {
  /** File text, or null if unreadable. */
  readFile(path: string): Promise<string | null>;
  /** Path where the symbol appears, null if nowhere; undefined if the search couldn't run. */
  findSymbol(symbol: string): Promise<string | null | undefined>;
};

const MAX_SYMBOL_SEARCHES = 8;

/** Checks every reference against the repository. Also returns the files it read, for the reviewer. */
export async function checkReferences(
  refs: References,
  tree: string[],
  lookups: Lookups,
): Promise<{ grounding: Grounding; files: Map<string, string> }> {
  const files = new Map<string, string>();
  const resolved = new Map<string, string | null>();
  const paths: GroundingItem[] = [];

  for (const ref of refs.paths) {
    const hit = resolvePath(ref, tree);
    resolved.set(ref, hit);
    paths.push(hit ? { ref, status: "found", detail: hit === ref ? undefined : `matches ${hit}` } : { ref, status: "missing" });
    if (hit && files.size < 8 && !files.has(hit)) {
      const text = await lookups.readFile(hit);
      if (text !== null) files.set(hit, text);
    }
  }

  const lines: GroundingItem[] = [];
  for (const { path, line } of refs.lines) {
    const hit = resolved.get(path) ?? resolvePath(path, tree);
    const ref = `${path}:${line}`;
    if (!hit) {
      lines.push({ ref, status: "missing", detail: "the file doesn't exist" });
      continue;
    }
    const text = files.get(hit) ?? (await lookups.readFile(hit));
    if (text === null) {
      lines.push({ ref, status: "unchecked", detail: "the file couldn't be read" });
      continue;
    }
    const count = text.split("\n").length;
    lines.push(
      line <= count ? { ref, status: "found" } : { ref, status: "missing", detail: `the file has only ${count} lines` },
    );
  }

  const symbols: GroundingItem[] = [];
  let searches = 0;
  for (const sym of refs.symbols) {
    const local = [...files.entries()].find(([, text]) => new RegExp(`\\b${sym}\\b`).test(text));
    if (local) {
      symbols.push({ ref: sym, status: "found", detail: `in ${local[0]}` });
      continue;
    }
    if (searches >= MAX_SYMBOL_SEARCHES) {
      symbols.push({ ref: sym, status: "unchecked", detail: "search limit reached" });
      continue;
    }
    searches++;
    const where = await lookups.findSymbol(sym).catch(() => undefined);
    symbols.push(
      where === undefined
        ? { ref: sym, status: "unchecked", detail: "code search unavailable" }
        : where
          ? { ref: sym, status: "found", detail: `in ${where}` }
          : { ref: sym, status: "missing", detail: "not found anywhere in the repository" },
    );
  }

  const all = [...paths, ...lines, ...symbols];
  const found = all.filter((i) => i.status === "found").length;
  const missing = all.filter((i) => i.status === "missing").length;
  return {
    grounding: { paths, lines, symbols, missingShare: found + missing === 0 ? null : missing / (found + missing) },
    files,
  };
}

/** One paragraph a reviewer (human or model) can read. */
export function describeGrounding(g: Grounding): string {
  const fmt = (label: string, items: GroundingItem[]) =>
    items.length
      ? `${label}:\n${items.map((i) => `- ${i.ref}: ${i.status}${i.detail ? ` (${i.detail})` : ""}`).join("\n")}`
      : `${label}: none cited`;
  const head =
    g.missingShare === null
      ? "The report cites no files, lines or functions that could be checked."
      : `${Math.round(g.missingShare * 100)}% of the checkable references do not exist in the repository.`;
  return [head, fmt("Files", g.paths), fmt("Line numbers", g.lines), fmt("Functions and identifiers", g.symbols)].join("\n\n");
}
