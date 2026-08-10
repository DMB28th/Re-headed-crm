import { NextResponse } from "next/server";

const BOOTED_AT = new Date().toISOString();

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "cardstack-studio",
    // Same precedence as the MCP server's /healthz, and for the same reason:
    // CARDSTACK_RELEASE_SHA is hand-set, so letting it win means reporting a
    // stale commit for every deploy after the one it was set for. The
    // platform's injected SHA is the truth; the manual value is only a fallback
    // for `railway up` tarball deploys, where Railway injects nothing.
    commit:
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      process.env.CARDSTACK_RELEASE_SHA ??
      "local",
    bootedAt: BOOTED_AT,
  });
}
