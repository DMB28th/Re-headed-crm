"use client";

import { usePathname } from "next/navigation";
import { NavRail } from "./nav-rail";

export function StudioShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return children;
  return (
    <div className="min-h-screen lg:flex">
      <NavRail />
      <main className="min-w-0 px-5 pb-8 pt-[76px] lg:flex-1 lg:px-8 lg:py-7">
        {children}
      </main>
    </div>
  );
}
