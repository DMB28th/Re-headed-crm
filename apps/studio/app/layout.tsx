// Deploy touch 2026-07-25: flow-native widget changes live in packages/; watch patterns need an apps/ change.
import type { Metadata } from "next";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { StudioShell } from "../components/studio-shell";
import { getStudioIdentity } from "../lib/auth";

export const metadata: Metadata = {
  title: "Cardstack Studio",
  description: "Design and govern the record cards your reps see in chat.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Resolved on every render, including signed-out auth pages — `.catch`
  // because a locked-down store (e.g. missing CARDSTACK_ENCRYPTION_KEY) must
  // not take the whole layout down over a banner.
  const identity = await getStudioIdentity().catch(() => null);
  const emailUnverified = Boolean(
    identity && identity.account.email && !identity.account.emailVerifiedAt,
  );
  return (
    <html lang="en">
      <body>
        <StudioShell emailUnverified={emailUnverified}>{children}</StudioShell>
      </body>
    </html>
  );
}
