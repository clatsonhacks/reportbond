// Checks that an advisory link is a GitHub private advisory on this pool's repo that this reporter
// may pay a deposit for, and takes the filing fee when one is set.
import { advisoryHashOf, parseAdvisoryUrl, repoIdOf } from "@/lib/advisory";
import { syncPoolAdvisories } from "@/lib/server/advisorySync";
import { loadGithub, loadPrivate } from "@/lib/server/db";
import { githubConfigured } from "@/lib/server/github";
import { currentSession } from "@/lib/server/githubSession";
import { syncFresh } from "@/lib/server/indexer";
import { collectFee, feeView, filingFee, paidFee, paymentRequiredResponse } from "@/lib/server/nano";
import { bad, json } from "@/lib/server/views";

export async function POST(req: Request) {
  const { poolId, url } = (await req.json().catch(() => ({}))) as { poolId?: number; url?: string };
  const parsed = url ? parseAdvisoryUrl(url) : null;
  if (!parsed) {
    return bad(
      "That isn't a GitHub advisory link. It should look like github.com/owner/repo/security/advisories/GHSA-xxxx-xxxx-xxxx",
    );
  }
  const d = await syncFresh(); // fresh, so a just-filed duplicate is caught
  const pool = d.pools[String(poolId)];
  if (!pool) return bad("Pool not found", 404);
  const repo = `${parsed.owner}/${parsed.repo}`;
  if (repoIdOf(repo) !== pool.repoId) {
    const expected = (await loadPrivate()).repoNames[pool.id];
    return bad(`This advisory is on ${repo}, but this pool is for ${expected ?? "a different repo"}.`);
  }
  // On a pool verified through GitHub we can see the repository's reports, so a deposit is only
  // offered for a report that exists there and was filed by the signed-in GitHub account.
  const verified = githubConfigured() ? (await loadGithub()).verifiedPools[String(poolId)] : undefined;
  if (verified) {
    const session = await currentSession();
    if (!session) return bad("Sign in with GitHub to pay the deposit for your report", 401);
    const available = await syncPoolAdvisories(String(poolId), true);
    if (!available) {
      return bad("This repository doesn't accept private vulnerability reports on GitHub. It must be public, with private vulnerability reporting turned on.", 409);
    }
    const tracked = (await loadGithub()).advisories[parsed.ghsa];
    if (!tracked || tracked.repo !== verified.repo) {
      return bad("We can't find that report on GitHub. File it under Security, Report a vulnerability, then try again.", 404);
    }
    if (tracked.reporter && tracked.reporter !== session.login) {
      return bad(`That report was filed by a different GitHub account, not @${session.login}.`, 403);
    }
  }
  const advisoryHash = advisoryHashOf(parsed.url);
  const duplicate = Object.values(d.reports).find((r) => r.advisoryHash === advisoryHash && r.status <= 2);
  if (duplicate) return bad(`This advisory already has an open report (#${duplicate.id}).`);
  const result = { ok: true, repo, ghsa: parsed.ghsa, url: parsed.url, advisoryHash };
  // Last, once the report is known to be payable: the filing fee, paid through Circle Gateway.
  // Without a payment the answer is 402 with what to pay; the browser signs and asks again.
  const fee = filingFee();
  if (!fee) return json(result);
  try {
    let record = await paidFee(advisoryHash);
    if (!record) {
      const header = req.headers.get("payment-signature");
      if (!header) return await paymentRequiredResponse(req, fee);
      const paid = await collectFee(header, fee, advisoryHash);
      if (!paid.ok) return await paymentRequiredResponse(req, fee, paid.reason);
      record = paid.record;
    }
    return json({ ...result, fee: feeView(fee, record) });
  } catch (e) {
    return bad(`The filing fee can't be taken right now: ${(e as Error).message}`, 502);
  }
}
