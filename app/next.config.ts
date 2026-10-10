import type { NextConfig } from "next";
import path from "node:path";
import "./lib/server/env";

// config/*.json sits outside app/, so let the bundler see the repo root.
const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  // A second dev server (tests on another port) needs its own build folder: NEXT_DIST_DIR=.next-test
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  env: {
    NEXT_PUBLIC_NETWORK: process.env.NETWORK ?? "testnet",
  },
};

export default nextConfig;
