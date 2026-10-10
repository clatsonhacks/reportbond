// Tools the triage agent uses to check a report against the real code. All read-only, all scoped to
// one repository at one ref, and all bounded: the agent can look, it cannot change anything.
import "server-only";
import type { AgentTool } from "../agentLoop";
import { resolvePath } from "../../grounding";
import { installationGet } from "../github";
import { fileText } from "../repo";
import { findSkill, skillIndex } from "./skills";

const MAX_LINES = 250;
const MAX_SEARCHES = 6;

export function repoTools(installationId: number, repo: string, ref: string, tree: string[]): AgentTool[] {
  const cache = new Map<string, string | null>();
  const read = async (path: string) => {
    if (!cache.has(path)) cache.set(path, await fileText(installationId, repo, path, ref));
    return cache.get(path)!;
  };
  let searches = 0;

  return [
    {
      name: "list_files",
      description:
        "List files in the repository. Give a directory to list what is under it, or leave it empty for the top level. Use it to find where something lives before reading.",
      parameters: {
        type: "object",
        properties: { directory: { type: "string", description: "Directory path such as src/parser. Empty for the whole repository." } },
        required: [],
        additionalProperties: false,
      },
      async run(args) {
        const dir = String(args.directory ?? "").replace(/^\.?\/+|\/+$/g, "");
        const under = dir ? tree.filter((p) => p.startsWith(`${dir}/`)) : tree;
        if (!under.length) throw new Error(`No files under "${dir}". Call list_files with no directory to see the top level.`);
        const shown = under.slice(0, 300);
        return `${under.length} file(s)${dir ? ` under ${dir}` : ""}:\n${shown.join("\n")}${under.length > shown.length ? "\n[... more not shown; list a subdirectory ...]" : ""}`;
      },
    },
    {
      name: "read_file",
      description: `Read a file from the repository with line numbers. Returns up to ${MAX_LINES} lines per call; give start_line to read further. The path must exist: use list_files or search_code to find it.`,
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Repository path, e.g. src/parser/header.c" },
          start_line: { type: "integer", description: "First line to return, from 1. Defaults to 1." },
        },
        required: ["path"],
        additionalProperties: false,
      },
      async run(args) {
        const asked = String(args.path ?? "").replace(/^\.?\/+/, "");
        // Only files in the repository listing can be read: no traversal, no other repositories.
        const path = resolvePath(asked, tree);
        if (!path) throw new Error(`"${asked}" is not a file in this repository.`);
        const text = await read(path);
        if (text === null) throw new Error(`${path} is binary or too large to read.`);
        const lines = text.split("\n");
        const start = Math.max(1, Math.min(lines.length, Math.floor(Number(args.start_line ?? 1)) || 1));
        const end = Math.min(lines.length, start + MAX_LINES - 1);
        const body = lines
          .slice(start - 1, end)
          .map((l, i) => `${String(start + i).padStart(5)}  ${l}`)
          .join("\n");
        return `${path}, lines ${start}-${end} of ${lines.length}:\n${body}${end < lines.length ? `\n[... continues; call again with start_line ${end + 1} ...]` : ""}`;
      },
    },
    {
      name: "search_code",
      description: `Search the repository's code for a word or identifier, e.g. a function name to find its definition and callers. Returns matching files with the lines that match. Limited to ${MAX_SEARCHES} searches, so search for specific names.`,
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "An identifier or short phrase to find." } },
        required: ["query"],
        additionalProperties: false,
      },
      async run(args) {
        const query = String(args.query ?? "").trim();
        if (!query) throw new Error("Give a word or identifier to search for.");
        if (++searches > MAX_SEARCHES) throw new Error("Search limit reached. Use list_files and read_file instead.");
        const q = encodeURIComponent(`${query} repo:${repo}`);
        const r = await installationGet<{ items?: { path: string; text_matches?: { fragment?: string }[] }[] }>(
          installationId,
          `/search/code?q=${q}&per_page=10`,
          { headers: { accept: "application/vnd.github.text-match+json" } },
        );
        const items = r.items ?? [];
        if (!items.length) return `No matches for "${query}" in the repository.`;
        return items
          .map((it) => {
            const frags = (it.text_matches ?? []).map((m) => (m.fragment ?? "").trim()).filter(Boolean).slice(0, 2);
            return `${it.path}${frags.length ? `\n${frags.map((f) => `    ${f.split("\n").join("\n    ")}`).join("\n    ...\n")}` : ""}`;
          })
          .join("\n");
      },
    },
    {
      name: "load_skill",
      description: `Load a review playbook for a class of vulnerability: a checklist of what to verify in the code before believing the claim. Load the one that fits the report before investigating. Available:\n${skillIndex()}`,
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "The playbook name, e.g. memory-safety" } },
        required: ["name"],
        additionalProperties: false,
      },
      async run(args) {
        const skill = findSkill(String(args.name ?? ""));
        if (!skill) throw new Error(`No playbook with that name. Available:\n${skillIndex()}`);
        return skill.body;
      },
    },
  ];
}
