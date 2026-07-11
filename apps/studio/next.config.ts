import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @cardstack/widgets/react ships TS source so the preview renders the REAL
  // widget component — Studio transpiles it (one render codepath, no drift).
  transpilePackages: ["@cardstack/widgets"],
};

export default nextConfig;
