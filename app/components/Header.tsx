"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useGithubSession } from "@/lib/github";
import { GithubMark } from "./GithubConnect";

export function Header() {
  const pathname = usePathname();
  const github = useGithubSession();
  const login = github.data?.connected ? github.data.login : null;

  const navItems = [
    { href: "/#pools", label: "Pools" },
    { href: "/me", label: "My reports" },
    { href: "/maintainer", label: "Maintainers" },
  ];

  return (
    <header className="sticky top-0 z-50 bg-card/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 sm:px-12 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="group flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-card">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <span className="text-base font-bold tracking-tight">ReportBond</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map(({ href, label }) => {
              const isActive = pathname === "/" ? href === "/#pools" : pathname.startsWith(href.split('#')[0]);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium state-change ${
                    isActive
                      ? "bg-surface text-ink"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={login || pathname === "/login" ? "/login" : `/login?next=${encodeURIComponent(pathname)}`}
            className="state-change inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-sm font-medium hover:border-ink"
            title={login ? `Signed in to GitHub as @${login}` : "Sign in with GitHub"}
          >
            <GithubMark className="h-4 w-4" />
            {login ? `@${login}` : "Sign in"}
          </Link>
          <ConnectButton showBalance={{ smallScreen: false, largeScreen: true }} chainStatus="none" accountStatus="address" />
        </div>
      </div>
    </header>
  );
}
