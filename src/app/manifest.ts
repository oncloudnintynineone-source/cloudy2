import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cloudy",
    short_name: "Cloudy",
    description: "Cloud Calendar Movement",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    // Dark grey: the Android PWA splash (manifest icon + background_color)
    // stays up until first paint, which can take a while on a Neon
    // scale-to-zero cold start — matching the offline/dark palette makes the
    // wait read as part of the app rather than a black screen.
    background_color: "#111111",
    theme_color: "#111111",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
