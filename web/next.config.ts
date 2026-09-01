import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  env: {
    // Baked at build time so /api/version can report what the live build came from.
    BALLAST_COMMIT:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.BALLAST_COMMIT ?? "local",
    BALLAST_BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
