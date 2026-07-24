// Deploy touch 2026-07-24: R10 is packages-only; watch patterns need an apps/ change.
// this file changing makes the studio service pick up crm-adapters fixes.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @cardstack/widgets/react ships TS source so the preview renders the REAL
  // widget component — Studio transpiles it (one render codepath, no drift).
  transpilePackages: ["@cardstack/widgets"],
};

export default nextConfig;
