"use client";

import { usePathname } from "next/navigation";
import { NavRail } from "./nav-rail";

/** Hides the Studio chrome on auth surfaces (/login). */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return <>{children}</>;
  }
  return (
    <div className="flex min-h-screen">
      <NavRail />
      <main className="flex-1 min-w-0 px-7 py-6">{children}</main>
    </div>
  );
}
