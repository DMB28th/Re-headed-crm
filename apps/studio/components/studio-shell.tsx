"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { NavRail } from "./nav-rail";

/**
 * Pages that render without the admin nav rail: the six auth screens (all
 * reachable signed out, or mid-transition) and `/me/connection` — the one
 * page a workspace MEMBER may open, and every link in the rail would 401 or
 * bounce them back to a lockout message.
 */
const BARE_PATHS = new Set([
  "/login",
  "/signup",
  "/forgot",
  "/reset",
  "/verify",
  "/link",
  "/me/connection",
]);

export function StudioShell({
  children,
  emailUnverified = false,
}: {
  children: React.ReactNode;
  emailUnverified?: boolean;
}) {
  const pathname = usePathname();
  if (BARE_PATHS.has(pathname)) return children;
  return (
    <div className="min-h-screen lg:flex">
      <NavRail />
      <main className="min-w-0 px-5 pb-8 pt-[76px] lg:flex-1 lg:px-8 lg:py-7">
        {emailUnverified && <VerifyBanner />}
        {children}
      </main>
    </div>
  );
}

/**
 * "Verify your email" banner for a signed-in account whose email is unset as
 * verified. Draft-chip palette (`bg-draft`/`text-draft-ink`) — the same
 * "not live yet" vocabulary as `StatusChip`'s staged state, repurposed here
 * for "not confirmed yet". "Resend" POSTs `/api/auth/resend-verification`
 * (identity comes from the session cookie, not anything this component
 * sends) and flips to "Sent." rather than navigating anywhere.
 */
function VerifyBanner() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const resend = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/resend-verification", { method: "POST" });
      if (response.ok) setSent(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-5 flex items-center justify-between gap-3 rounded-[9px] bg-draft px-4 py-2.5 text-[13px] text-draft-ink">
      <span>Verify your email — we sent a link to your inbox.</span>
      <button
        type="button"
        onClick={resend}
        disabled={busy || sent}
        className="shrink-0 font-medium underline-offset-2 hover:underline disabled:no-underline disabled:opacity-70"
      >
        {sent ? "Sent." : busy ? "Sending…" : "Resend"}
      </button>
    </div>
  );
}
