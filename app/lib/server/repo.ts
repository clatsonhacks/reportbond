// Read-only access to a maintainer's repository through the GitHub App installation:
// what the setup and triage agents need to check claims against the real code.
import "server-only";
import { GithubError, installationGet } from "./github";

export type RepoInfo = { fullName: string; defaultBranch: string; description: string; language: string | null };

export async function repoInfo(installationId: number, repo: string): Promise<RepoInfo> {
  const r = await installationGet<{ full_name: string; default_branch: string; description: string | null; language: string | null }>(
    installationId,
    `/repos/${repo}`,
  );
  return { fullName: r.full_name, defaultBranch: r.default_branch, description: r.description ?? "", language: r.language };
}

/** Every file path in the repository at `ref`. `truncated` is true for very large repos (GitHub caps the listing). */
export async function repoTree(installationId: number, repo: string, ref: string): Promise<{ paths: string[]; truncated: boolean }> {
  const t = await installationGet<{ tree: { path: string; type: string }[]; truncated: boolean }>(
    installationId,
    `/repos/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
  );
  return { paths: t.tree.filter((e) => e.type === "blob").map((e) => e.path), truncated: t.truncated };
}

const MAX_FILE_BYTES = 400_000;

/** A file's text, or null if it doesn't exist, is binary, or is too large to be useful. */
export async function fileText(installationId: number, repo: string, path: string, ref: string): Promise<string | null> {
  try {
    const f = await installationGet<{ type?: string; size?: number; encoding?: string; content?: string }>(
      installationId,
      `/repos/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
    );
    if (f.type !== "file" || f.encoding !== "base64" || !f.content || (f.size ?? 0) > MAX_FILE_BYTES) return null;
    const text = Buffer.from(f.content, "base64").toString("utf8");
    return text.includes("\u0000") ? null : text;
  } catch (e) {
    if (e instanceof GithubError && e.status === 404) return null;
    throw e;
  }
}

/** Whether `symbol` appears anywhere in the repo's code (GitHub code search; default branch only). */
export async function symbolInRepo(installationId: number, repo: string, symbol: string): Promise<string | null> {
  const q = encodeURIComponent(`"${symbol}" repo:${repo} in:file`);
  const r = await installationGet<{ items?: { path: string }[] }>(installationId, `/search/code?q=${q}&per_page=1`);
  return r.items?.[0]?.path ?? null;
}

export type AdvisoryContent = {
  ghsa: string;
  summary: string;
  description: string;
  severity: string | null;
  cwes: string[];
  affected: string[];
  state: string;
};

/** The private report itself: what the reporter wrote. Untrusted text. */
export async function advisoryContent(installationId: number, repo: string, ghsa: string): Promise<AdvisoryContent> {
  const a = await installationGet<{
    ghsa_id: string;
    summary?: string;
    description?: string | null;
    severity?: string | null;
    state: string;
    cwe_ids?: string[] | null;
    vulnerabilities?: { package?: { name?: string | null; ecosystem?: string | null } | null; vulnerable_version_range?: string | null }[] | null;
  }>(installationId, `/repos/${repo}/security-advisories/${ghsa}`);
  return {
    ghsa: a.ghsa_id,
    summary: a.summary ?? "",
    description: a.description ?? "",
    severity: a.severity ?? null,
    cwes: a.cwe_ids ?? [],
    affected: (a.vulnerabilities ?? []).map((v) =>
      [v.package?.ecosystem, v.package?.name, v.vulnerable_version_range].filter(Boolean).join(" "),
    ),
    state: a.state,
  };
}

export type AdvisoryListItem = {
  ghsa_id: string;
  html_url: string;
  state: string;
  created_at?: string;
  summary?: string;
  author?: { login: string } | null;
};

/** The repository's security advisories, newest first, including private reports still in triage. */
export async function listAdvisories(installationId: number, repo: string): Promise<AdvisoryListItem[]> {
  return installationGet<AdvisoryListItem[]>(
    installationId,
    `/repos/${repo}/security-advisories?per_page=50&sort=created&direction=desc`,
  );
}
