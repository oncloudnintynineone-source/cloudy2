"use client";

import { useMemo } from "react";
import { Anchor } from "@mantine/core";

import { splitRemarksUrls, type RemarksSegment } from "@/lib/linkPreviews/extract";
import { EXTERNAL_LINK_PROPS, isHttpUrl, shortenUrl } from "@/lib/ui/externalLink";

interface LinkifiedTextProps {
  text: string;
  /**
   * Pre-computed segments (the remarks renderer already splits the text to map
   * preview cards back to their author href). Omitted → split here.
   */
  segments?: RemarksSegment[];
}

/**
 * Remark-style plain text with its URLs as real links
 * (docs/event-lifecycle.md §1.7.5). Renders inline nodes only, so callers keep
 * their own `<Text>` wrapper and typography: the details modal's Remarks
 * section (inside its clamped paragraph) and its Location row both use this.
 *
 * A URL is never trusted blindly: only `http(s)` hrefs become anchors (the
 * extractor already allowlists them — this is the render-time re-check), and
 * every link opens in a new tab through {@link EXTERNAL_LINK_PROPS}.
 */
export function LinkifiedText({ text, segments }: LinkifiedTextProps) {
  const runs = useMemo(() => segments ?? splitRemarksUrls(text), [segments, text]);
  return (
    <>
      {runs.map((run, index) =>
        run.kind === "link" && isHttpUrl(run.href) ? (
          <Anchor key={index} href={run.href} {...EXTERNAL_LINK_PROPS} size="sm" inline>
            {shortenUrl(run.href)}
          </Anchor>
        ) : (
          <span key={index}>{run.text}</span>
        ),
      )}
    </>
  );
}
