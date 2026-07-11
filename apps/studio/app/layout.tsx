import type { Metadata } from "next";
import "@fontsource-variable/instrument-sans";
import "./globals.css";
import { NavRail } from "../components/nav-rail";

export const metadata: Metadata = {
  title: "Cardstack Studio",
  description: "Design and govern the record cards your reps see in chat.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen">
          <NavRail />
          <main className="flex-1 min-w-0 px-7 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
