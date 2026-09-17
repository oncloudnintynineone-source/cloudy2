import { withSerwist } from "@serwist/turbopack";
import type { NextConfig } from "next";

const nextConfig: NextConfig = withSerwist({
  // Dual-platform hosting: Vercel (live) + a Cloud Run shadow built from the same
  // source (see docs/developer-guide.md §1.9.1). The Cloud Run Docker image runs
  // the regular `next start` server over the full `.next` build — no Cloud
  // Run-specific config is needed here, so Vercel's build is byte-identical to a
  // Vercel-only setup. Platform differences must live in the Dockerfile/env,
  // never in next.config or src/.
  async redirects() {
    return [
      { source: "/users", destination: "/settings/users", permanent: true },
      { source: "/departments", destination: "/settings/departments", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // The service worker script must never be served from a cache: a stale
        // `sw.js` means a deploy is never discovered, so the app stays on the
        // old build. The route is `force-static` (createSerwistRoute), which
        // Next would otherwise send with `s-maxage=31536000`. Paired with
        // `updateViaCache: "none"` at registration (src/app/layout.tsx).
        source: "/serwist/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
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
  // Nodemailer is Node-only (net/tls internals) — keep it out of the bundle.
  serverExternalPackages: ["nodemailer"],
  // No extra config needed — Serwist reads swSrc/swDest from the route handler.
});

export default nextConfig;
