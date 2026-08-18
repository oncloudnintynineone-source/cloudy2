import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = withSerwist({
  async redirects() {
    return [
      { source: "/users", destination: "/settings/users", permanent: true },
      { source: "/departments", destination: "/settings/departments", permanent: true },
    ];
  },
  experimental: {
    optimizePackageImports: [
      "@mantine/core",
      "@mantine/hooks",
      "@mantine/dates",
      "@mantine/form",
      "@mantine/notifications",
    ],
  },
  // No extra config needed — Serwist reads swSrc/swDest from the route handler.
});

export default nextConfig;
