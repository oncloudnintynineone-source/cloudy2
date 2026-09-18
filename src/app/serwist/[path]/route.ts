import { createSerwistRoute } from "@serwist/turbopack";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The JS chunk paths (relative to the Next dist dir) that make up the app shell
 * — the framework runtime, React, the shared root chunk and the `nomodule`
 * polyfill. Read from Next's build manifest so it survives every hashed
 * filename change. Returns `null` when the manifest isn't readable yet (e.g. a
 * very early build pass), in which case the filter is skipped and every chunk
 * is precached exactly as before.
 */
function readCoreChunkPaths(): Set<string> | null {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".next", "build-manifest.json"), "utf8");
    const manifest = JSON.parse(raw) as {
      rootMainFiles?: string[];
      polyfillFiles?: string[];
    };
    return new Set([...(manifest.rootMainFiles ?? []), ...(manifest.polyfillFiles ?? [])]);
  } catch {
    return null;
  }
}

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "src/app/sw.ts",
    useNativeEsbuild: true,
    // Precache only the shell's core JS (plus every CSS/HTML/image, which this
    // filter leaves untouched). Route-specific chunks — the dashboard's calendar
    // views, every admin/settings screen, the event wizard — are fetched on
    // demand and cached by the SW's `static-chunk-assets` runtime rule, so a
    // visited route still works offline while an unvisited one never costs a
    // byte at install. Cuts the install-time precache from the whole bundle
    // (~3 MB) to the shell (~1 MB) on first visit.
    manifestTransforms: [
      (entries) => {
        const core = readCoreChunkPaths();
        if (!core) return { manifest: entries, warnings: [] };
        const manifest = entries.filter((entry) => {
          const match = /(?:^|\/)(static\/chunks\/[^/]+\.js)$/.exec(entry.url);
          if (!match) return true;
          return core.has(match[1]);
        });
        return { manifest, warnings: [] };
      },
    ],
  });
