import { ButtonLink, Card } from "@/components/ui";
import { PoolList } from "@/components/PoolList";

const verdicts = [
  { name: "Valid", meaning: "A real vulnerability", outcome: "Deposit returned, plus a bounty from the pool", tone: "text-returned" },
  { name: "Honest mistake", meaning: "Not a real vulnerability, but a fair report", outcome: "Deposit returned", tone: "text-returned" },
  { name: "Slop", meaning: "Low-effort or fabricated", outcome: "Deposit kept in the pool to pay future valid reports", tone: "text-slashed" },
  { name: "No answer", meaning: "Maintainer silent past the deadline", outcome: "Anyone can return the deposit", tone: "text-returned" },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="space-y-5 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          A refundable price on the door for private security reports.
        </h1>
        <p className="max-w-2xl text-lg text-ink-muted">
          Reporters pay a small USDC deposit when filing a private vulnerability report on GitHub. Honest reports get it
          back. Slop pays for the next real bug. The money sits in a contract on Arc that nobody can reach into.
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink href="/maintainer">Open a pool</ButtonLink>
          <ButtonLink href="#pools" variant="secondary">
            Find a pool
          </ButtonLink>
        </div>
      </section>

      <section id="how-it-works" className="space-y-4 scroll-mt-8">
        <h2 className="text-xl font-semibold">How it works</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ["File on GitHub", "Write your private vulnerability report on GitHub as usual."],
            ["Pay the deposit", "Paste the advisory link here and pay the pool's exact deposit."],
            ["Get a verdict", "The maintainer signs a verdict, or your deposit returns after the deadline."],
          ].map(([title, body], i) => (
            <li key={title} className="rounded-[8px] border border-line bg-card p-4">
              <p className="num text-sm text-ink-muted">0{i + 1}</p>
              <p className="mt-1 font-medium">{title}</p>
              <p className="mt-1 text-sm text-ink-muted">{body}</p>
            </li>
          ))}
        </ol>
        <Card className="overflow-x-auto p-0 sm:p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-ink-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Verdict</th>
                <th className="px-4 py-3 font-medium">Meaning</th>
                <th className="px-4 py-3 font-medium">Deposit</th>
              </tr>
            </thead>
            <tbody>
              {verdicts.map((v) => (
                <tr key={v.name} className="border-b border-line last:border-0">
                  <td className={`px-4 py-3 font-medium ${v.tone}`}>{v.name}</td>
                  <td className="px-4 py-3">{v.meaning}</td>
                  <td className="px-4 py-3">{v.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-sm text-ink-muted">
          Verdicts are signed by the maintainer and are final. Our server only delivers them and can&apos;t change them.
          A maintainer can&apos;t profit from calling reports slop: slashed deposits can only pay other reporters.
        </p>
      </section>

      <section id="pools" className="space-y-4 scroll-mt-8">
        <h2 className="text-xl font-semibold">Pools</h2>
        <PoolList />
      </section>
    </div>
  );
}
