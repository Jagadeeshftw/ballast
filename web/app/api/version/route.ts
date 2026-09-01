import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Drift guard. Reports the commit the LIVE build was made from.
 *
 * On Vickrey four commits sat pushed and undeployed because the host had no repository
 * connected and every deploy was a manual CLI push. Nobody could tell by looking. This
 * endpoint plus `scripts/check-deploy.sh` makes that state impossible to miss.
 */
export async function GET() {
  return NextResponse.json({
    commit: process.env.BALLAST_COMMIT ?? "unknown",
    builtAt: process.env.BALLAST_BUILT_AT ?? "unknown",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "unknown",
    env: process.env.VERCEL_ENV ?? "local",
  });
}
