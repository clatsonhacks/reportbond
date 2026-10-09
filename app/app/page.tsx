import { ButtonLink } from "@/components/ui";
import { PoolList } from "@/components/PoolList";
import {
  CheckBugIcon,
  ReturnBugIcon,
  WarningBugIcon,
  ClockBugIcon,
  ReportIcon,
  VerdictIcon,
  RewardIcon,
  FlowArrow,
} from "@/components/icons";

const verdicts = [
  {
    name: "Valid",
    meaning: "Real vulnerability found",
    outcome: "Deposit + Bounty",
    color: "text-returned",
    bgColor: "bg-returned-bg",
    Icon: CheckBugIcon,
  },
  {
    name: "Mistake",
    meaning: "Honest but not exploitable",
    outcome: "Deposit returned",
    color: "text-returned",
    bgColor: "bg-returned-bg",
    Icon: ReturnBugIcon,
  },
  {
    name: "Slop",
    meaning: "Low-effort or fake",
    outcome: "Deposit kept",
    color: "text-slashed",
    bgColor: "bg-slashed-bg",
    Icon: WarningBugIcon,
  },
  {
    name: "Refunded",
    meaning: "No response from maintainer",
    outcome: "Auto-returned",
    color: "text-ink-muted",
    bgColor: "bg-surface",
    Icon: ClockBugIcon,
  },
];

export default function Home() {
  return (
    <div className="space-y-20">
      {/* Hero Section - Bug Bounty Theme */}
      <section className="geometric-bg relative -mx-6 px-6 py-24 sm:mx-0 sm:rounded-4xl sm:px-12 sm:py-32 fade-in">
        <div className="relative z-10 mx-auto max-w-4xl">
          <div className="text-center space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-4 py-2 text-xs font-bold uppercase tracking-widest text-ink-muted">
              Bug Bounty Reports
            </div>

            <h1 className="text-6xl font-black leading-tight tracking-tight sm:text-7xl lg:text-8xl">
              Report Bugs.
              <span className="block text-ink-muted">Get Rewarded.</span>
            </h1>

            <p className="mx-auto max-w-2xl text-xl leading-relaxed text-ink-muted">
              Put down a refundable USDC deposit. Find real bugs, earn bounties.
              Submit slop, lose your deposit.
            </p>

            <div className="flex flex-wrap justify-center gap-4 pt-4">
              <ButtonLink href="/maintainer">
                Create Pool
              </ButtonLink>
              <ButtonLink href="#pools" variant="secondary">
                Browse Pools
              </ButtonLink>
            </div>
          </div>

          {/* Bug Verdicts Visual Tracker */}
          <div className="mt-16 grid gap-4 sm:grid-cols-4">
            {verdicts.map((v) => (
              <div key={v.name} className="relative overflow-hidden rounded-2xl bg-card border-2 border-line p-6 text-center shadow-sm hover:shadow-lg state-change">
                <div className="mb-4 flex justify-center">
                  <v.Icon className="h-16 w-16 bug-wiggle" />
                </div>
                <h3 className="mb-1 text-sm font-bold uppercase tracking-wide">{v.name}</h3>
                <p className="text-xs text-ink-muted">{v.outcome}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="space-y-10 scroll-mt-8 slide-up">
        <div className="text-center">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">How Bug Bounties Work</h2>
          <p className="mt-3 text-lg text-ink-muted">Report → Verdict → Get Paid</p>
        </div>

        {/* Flow with visual connections */}
        <div className="relative">
          <ol className="grid gap-6 sm:grid-cols-3">
            {[
              {
                title: "Report Bug",
                body: "File your vulnerability report on GitHub, then submit it here with your deposit.",
                Icon: ReportIcon,
                number: "01",
              },
              {
                title: "Get Verdict",
                body: "Maintainer reviews and signs a verdict: Valid, Mistake, or Slop.",
                Icon: VerdictIcon,
                number: "02",
              },
              {
                title: "Collect Reward",
                body: "Valid bugs earn deposit + bounty. Mistakes get refunded. Slop is lost.",
                Icon: RewardIcon,
                number: "03",
              },
            ].map(({ title, body, Icon, number }) => (
              <li key={title} className="card-hover group relative rounded-3xl border-2 border-line bg-card p-8">
                <div className="mb-4 flex justify-center">
                  <Icon className="h-16 w-16 float-slow" />
                </div>
                <div className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-muted">{number}</div>
                <h3 className="mb-3 text-2xl font-black tracking-tight">{title}</h3>
                <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
              </li>
            ))}
          </ol>

          {/* Flow arrows between steps */}
          <div className="pointer-events-none absolute inset-0 hidden sm:block">
            <FlowArrow className="absolute left-[28%] top-1/4 h-8 w-[18%]" />
            <FlowArrow className="absolute left-[61%] top-1/4 h-8 w-[18%]" />
          </div>
        </div>

        {/* Verdict Legend - Bug Tracking Style */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {verdicts.map((v) => (
            <div key={v.name} className={`rounded-2xl border-2 ${v.bgColor} border-line p-6`}>
              <div className="mb-4 flex justify-center">
                <v.Icon className="h-12 w-12" />
              </div>
              <h4 className={`mb-2 text-lg font-black ${v.color}`}>{v.name}</h4>
              <p className="mb-1 text-sm font-medium text-ink-muted">{v.meaning}</p>
              <p className="text-xs text-ink-muted">→ {v.outcome}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-ink-muted">
          Verdicts are cryptographically signed by maintainers. No one can change or fake them.
        </p>
      </section>

      <section id="pools" className="space-y-10 scroll-mt-8 slide-up">
        <div className="text-center">
          <h2 className="text-4xl font-black tracking-tight sm:text-5xl">Active Bug Bounty Pools</h2>
          <p className="mt-3 text-lg text-ink-muted">Choose a repository and start hunting for vulnerabilities</p>
        </div>
        <PoolList />
      </section>
    </div>
  );
}
