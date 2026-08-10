// Deploy touch 2026-07-25: flow-native widget changes live in packages/; watch patterns need an apps/ change.
import type { Metadata } from "next";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { StudioShell } from "../components/studio-shell";

export const metadata: Metadata = {
  title: "Cardstack Studio",
  description: "Design and govern the record cards your reps see in chat.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StudioShell>{children}</StudioShell>
      </body>
    </html>
  );
}
