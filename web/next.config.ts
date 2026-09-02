import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  // The preview paths were shared while the direction was being reviewed. Keep them
  // resolving rather than 404ing something already in someone's tab or a message.
  async redirects() {
    return [
      { source: "/preview/a", destination: "/", permanent: true },
      { source: "/preview/app", destination: "/app", permanent: true },
      { source: "/preview/app/:path*", destination: "/app/:path*", permanent: true },
      { source: "/preview/:path*", destination: "/", permanent: false },
    ];
  },
  env: {
    // Baked at build time so /api/version can report what the live build came from.
    BALLAST_COMMIT:
      process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.BALLAST_COMMIT ?? "local",
    BALLAST_BUILT_AT: new Date().toISOString(),
  },
};

export default nextConfig;
