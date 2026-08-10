import { NextResponse } from "next/server";

const BOOTED_AT = new Date().toISOString();

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "cardstack-studio",
    commit:
      process.env.CARDSTACK_RELEASE_SHA ??
      process.env.RAILWAY_GIT_COMMIT_SHA ??
      "local",
    bootedAt: BOOTED_AT,
  });
}
