import { ButtonLink } from "@/components/ui";
import { OpenPools } from "@/components/OpenPools";
import { PoolNetworkGraph } from "@/components/graph/PoolNetwork";

const steps = [
  {
    number: "1",
    title: "Bond your report",
    description: "Link a private GitHub advisory and pay the pool's deposit.",
  },
  {
    number: "2",
    title: "Maintainer signs a verdict",
    description: "Valid, honest mistake or slop. No answer before the deadline means automatic refund.",
  },
  {
    number: "3",
    title: "Withdraw",
    description: "Claim your bond back, plus the bounty when the bug is valid.",
  },
];

export default function Home() {
  return (
    <div>
      {/* Hero Section - Full width */}
      <section className="geometric-bg relative px-6 py-10 sm:px-12 sm:py-14 fade-in">
        <div className="relative z-10 mx-auto max-w-7xl">
          <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
            {/* Left: Text */}
            <div className="max-w-lg space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-bg px-3 py-1 text-xs font-medium text-brand">
                <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                Bug bounties on Arc - paid in USDC
              </div>

              <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
                Every report is bonded.
                <span className="block">Real bugs get paid.</span>
              </h1>

              <p className="text-base leading-relaxed text-ink-muted">
                Put down a small deposit with your report. Honest work gets it back, valid bugs earn the bounty on top, and slop forfeits it to the pool.
              </p>

              <div className="flex flex-wrap gap-3">
                <ButtonLink href="#pools">Find a pool</ButtonLink>
                <ButtonLink href="/maintainer" variant="secondary">
                  Fund a pool for your repo
                </ButtonLink>
              </div>
            </div>

            {/* Right: Mini constellation preview */}
            <div className="hidden lg:block">
              <div className="relative h-44 w-44 rounded-full border border-dashed border-brand/30">
                {/* Pool hub center */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                  <div className="node-hub h-12 w-12 flex items-center justify-center">
                  </div>
                </div>
                {/* Orbiting report satellites */}
                <div className="absolute left-2 top-4">
                  <div className="node-satellite node-valid h-5 w-5 flex items-center justify-center">
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
                <div className="absolute right-4 top-6">
                  <div className="node-satellite node-waiting h-4 w-4" />
                </div>
                <div className="absolute bottom-8 left-6">
                  <div className="node-satellite node-acknowledged h-4 w-4 relative">
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-acknowledged" />
                  </div>
                </div>
                <div className="absolute bottom-4 right-2">
                  <div className="node-satellite node-valid h-5 w-5 flex items-center justify-center">
                    <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 -top-1">
                  <div className="node-satellite node-mistake h-4 w-4" />
                </div>
                <div className="absolute -right-1 bottom-14">
                  <div className="node-satellite node-slop h-3.5 w-3.5 flex items-center justify-center">
                    <svg className="h-2 w-2" viewBox="0 0 12 12" fill="none">
                      <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>
                </div>
                {/* Connecting lines (decorative) */}
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 176 176">
                  <line x1="88" y1="88" x2="28" y2="32" className="edge" />
                  <line x1="88" y1="88" x2="148" y2="52" className="edge" />
                  <line x1="88" y1="88" x2="48" y2="120" className="edge" />
                  <line x1="88" y1="88" x2="152" y2="116" className="edge" />
                  <line x1="88" y1="88" x2="88" y2="20" className="edge" />
                  <line x1="88" y1="88" x2="160" y2="88" className="edge" />
                </svg>
              </div>
            </div>
          </div>

          {/* How it works steps */}
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {steps.map((step) => (
              <div
                key={step.number}
                className="rounded-xl border border-line bg-card p-4"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                    {step.number}
                  </span>
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pool Network Graph */}
      <section className="mx-auto max-w-7xl px-6 sm:px-12 py-10 space-y-4 slide-up">
        <div>
          <h2 className="text-xl font-black tracking-tight">Pool network</h2>
          <p className="text-sm text-ink-muted">
            Each pool sits at the centre of its reports. Reporters who work across pools link them together.
          </p>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4">
          <PoolNetworkGraph />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-brand" />
            Pool hub
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-valid" />
            Valid
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-mistake" />
            Mistake
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-slop" />
            Slop
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-dashed border-refunded" />
            Refunded
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-waiting" />
            Waiting
          </div>
          <div className="flex items-center gap-1.5">
            <span className="relative h-3 w-3 rounded-full border-2 border-acknowledged">
              <span className="absolute inset-1 rounded-full bg-acknowledged" />
            </span>
            Acknowledged
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-6 border-t-2 border-dashed border-brand" />
            Your reports
          </div>
        </div>
      </section>

      {/* Open Pools */}
      <section id="pools" className="mx-auto max-w-7xl px-6 sm:px-12 pb-16 space-y-4 scroll-mt-8 slide-up">
        <OpenPools />

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted pt-2">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-valid" />
            Valid
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-mistake" />
            Honest mistake
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slop" />
            Slop
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-refunded" />
            Auto-refunded
          </div>
        </div>
      </section>
    </div>
  );
}
