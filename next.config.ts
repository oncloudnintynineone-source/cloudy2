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
    // Client-router reuse window for dynamic pages (Next defaults it to 0 —
    // every soft navigation otherwise blocks on the network). Within 2 minutes,
    // revisiting a URL renders its cached RSC payload instantly; hard loads,
    // new param combos, and the force-refresh nonce are different cache keys
    // and always hit the server. Matches the data layer's tolerance
    // (60s-fresh gcal cache, 30min stale-while-revalidate).
    staleTimes: {
      dynamic: 120,
    },
  },
  // No extra config needed — Serwist reads swSrc/swDest from the route handler.
});

export default nextConfig;
