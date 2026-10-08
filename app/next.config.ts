import type { NextConfig } from "next";
import path from "node:path";
import "./lib/server/env";

// config/*.json sits outside app/, so let the bundler see the repo root.
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  env: {
    NEXT_PUBLIC_NETWORK: process.env.NETWORK ?? "testnet",
  },
};

export default nextConfig;
