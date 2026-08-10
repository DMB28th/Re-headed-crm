"use client";

import { usePathname } from "next/navigation";
import { NavRail } from "./nav-rail";

/**
 * Pages that render without the admin nav rail. `/login` is signed out;
 * `/me/connection` is the one page a workspace MEMBER may open, and every link
 * in the rail would 401 or bounce them back to a lockout message.
 */
const BARE_PATHS = new Set(["/login", "/me/connection"]);

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (BARE_PATHS.has(pathname)) return children;
  return (
    <div className="min-h-screen lg:flex">
      <NavRail />
      <main className="min-w-0 px-5 pb-8 pt-[76px] lg:flex-1 lg:px-8 lg:py-7">
        {children}
      </main>
    </div>
  );
}
