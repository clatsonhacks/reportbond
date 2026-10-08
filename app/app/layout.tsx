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
          <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">{children}</main>
          <footer className="mx-auto max-w-3xl px-4 pb-10 text-sm text-ink-muted">
            The contract holds all deposits. Nobody, including us, can take money out except by its rules.{" "}
            <Link href="/#how-it-works" className="underline underline-offset-2">
              How it works
            </Link>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
