"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { chain } from "@/lib/network";

export function Header() {
  return (
    <header className="border-b border-line bg-card">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-5">
          <Link href="/" className="font-semibold tracking-tight">
            ReportBond
          </Link>
          <nav className="flex gap-4 text-sm text-ink-muted">
            <Link href="/#pools" className="hover:text-ink">
              Pools
            </Link>
            <Link href="/me" className="hover:text-ink">
              My reports
            </Link>
            <Link href="/maintainer" className="hover:text-ink">
              Maintainers
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-ink-muted sm:inline">{chain.name}</span>
          <ConnectButton showBalance={{ smallScreen: false, largeScreen: true }} chainStatus="icon" accountStatus="address" />
        </div>
      </div>
    </header>
  );
}
