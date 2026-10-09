"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { chain } from "@/lib/network";
import { usePathname } from "next/navigation";

export function Header() {
  const pathname = usePathname();

  const navItems = [
    { href: "/#pools", label: "Pools" },
    { href: "/me", label: "My reports" },
    { href: "/maintainer", label: "Maintainers" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur-xl">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-6 py-6">
        <div className="flex items-center gap-10">
          <Link href="/" className="group flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <span className="text-lg font-black tracking-tight">ReportBond</span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex">
            {navItems.map(({ href, label }) => {
              const isActive = pathname === href || pathname.startsWith(href.split('#')[0]);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`text-sm font-medium state-change ${
                    isActive
                      ? "text-black"
                      : "text-gray-500 hover:text-black"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 sm:inline">
            {chain.name}
          </span>
          <ConnectButton showBalance={{ smallScreen: false, largeScreen: true }} chainStatus="icon" accountStatus="address" />
        </div>
      </div>
    </header>
  );
}
