import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid Turbopack mis-detecting the workspace root due to unrelated lockfiles.
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
