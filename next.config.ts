import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
