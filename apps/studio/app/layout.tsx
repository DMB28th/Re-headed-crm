import type { Metadata } from "next";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { AppShell } from "../components/app-shell";
import { isAuthEnabled } from "../lib/auth";

export const metadata: Metadata = {
  title: "Cardstack Studio",
  description: "Design and govern the record cards your reps see in chat.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body data-auth={isAuthEnabled() ? "on" : "off"}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
