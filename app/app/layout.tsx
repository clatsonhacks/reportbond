import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";
import { TestnetBanner } from "@/components/TestnetBanner";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = JetBrains_Mono({ variable: "--font-mono-face", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ReportBond",
  description: "Refundable USDC deposits for private security reports on GitHub, settled on Arc.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${mono.variable} font-sans antialiased`}>
        <Providers>
          <TestnetBanner />
          <Header />
          <main className="mx-auto w-full max-w-4xl px-6 py-12 sm:py-16">{children}</main>
          <footer className="mx-auto max-w-4xl px-6 pb-20 pt-16">
            <div className="rounded-3xl border-2 border-line bg-card p-8 text-center">
              <div className="mb-4 flex justify-center">
                <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" opacity="0.1" />
                  <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 11V7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="12" cy="16" r="1.5" fill="currentColor" />
                </svg>
              </div>
              <p className="mb-4 text-sm font-medium text-ink-muted">
                All deposits are held in a smart contract. Zero admin control. Zero withdrawal backdoors.
              </p>
              <Link
                href="/#how-it-works"
                className="inline-flex items-center gap-2 text-sm font-bold text-ink hover:gap-3 state-change"
              >
                Learn How It Works
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
