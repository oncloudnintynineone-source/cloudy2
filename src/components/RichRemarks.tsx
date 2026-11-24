"use client";

import { useEffect, useMemo, useState } from "react";
import { Anchor, Group, Paper, Stack, Text } from "@mantine/core";
import { postJson } from "@/lib/api/client";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import { extractPreviewUrls, splitRemarksUrls } from "@/lib/linkPreviews/extract";
import type { LinkPreview, LinkPreviewEntry } from "@/lib/linkPreviews/types";

/**
 * The event's remarks rendered "rich" in the details modal
 * (docs/event-lifecycle.md §1.12): the text stays exactly as stored (plain
 * text — Google Calendar shows the same words), but URLs become real links
 * and each linked page gets a preview card fetched from
 * `POST /api/link-preview`.
 *
 * The remarks text paints immediately; cards are enrichment that fades in
 * when it arrives (or never — offline, unsafe or meta-less links simply keep
 * their plain links). Previews are cached per page load, so reopening a
 * modal costs no request.
 */

/** Per-page-load preview cache (null = fetched and failed; never retried). */
const previewCache = new Map<string, LinkPreview | null>();

/** Link display text: no scheme, no trailing slash, ellipsised when long. */
function shortenUrl(href: string): string {
  const bare = href.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return bare.length > 48 ? `${bare.slice(0, 47)}…` : bare;
}

export function RichRemarks({ text }: { text: string }) {
  const segments = useMemo(() => splitRemarksUrls(text), [text]);
  const urls = useMemo(() => extractPreviewUrls(text), [text]);
  // Re-render trigger once the module cache fills (the cache itself is read
  // directly during render, so no state mirrors it).
  const [, setCacheVersion] = useState(0);

  useEffect(() => {
    const missing = urls.filter((url) => !previewCache.has(url));
    if (missing.length === 0) {
      return;
    }
    let cancelled = false;
    postJson<{ previews: LinkPreviewEntry[] }>(
      "/api/link-preview",
      { urls: missing },
      {
        priority: "low",
      },
    )
      .then((data) => {
        for (const entry of data?.previews ?? []) {
          previewCache.set(entry.url, entry.preview);
        }
        // Anything the server dropped (unsafe/capped) is a negative too.
        for (const url of missing) {
          if (!previewCache.has(url)) {
            previewCache.set(url, null);
          }
        }
      })
      .catch(() => {
        for (const url of missing) {
          previewCache.set(url, null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setCacheVersion((value) => value + 1);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [urls]);

  const previews = urls
    .map((url) => previewCache.get(url))
    .filter((preview): preview is LinkPreview => Boolean(preview));

  return (
    <Stack gap="xs">
      <Text size="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {segments.map((segment, index) =>
          segment.kind === "link" ? (
            <Anchor
              key={index}
              href={segment.href}
              target="_blank"
              rel="noopener noreferrer"
              size="sm"
              inline
            >
              {shortenUrl(segment.href)}
            </Anchor>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </Text>
      {previews.length > 0 && (
        <Stack gap={6} className={CONTENT_ENTER_CLASS}>
          {previews.map((preview) => (
            <PreviewCard key={preview.url} preview={preview} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

/** One preview card: the whole card is the link; a broken image hides itself. */
function PreviewCard({ preview }: { preview: LinkPreview }) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = preview.title ? `Open ${preview.title} (${preview.host})` : `Open ${preview.host}`;
  return (
    <Paper
      component="a"
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      withBorder
      radius="sm"
      p="xs"
      aria-label={label}
      style={{ display: "block", textDecoration: "none" }}
    >
      <Group gap="sm" wrap="nowrap">
        <Stack gap={2} flex="1" style={{ minWidth: 0 }}>
          <Text size="sm" fw={500} lineClamp={2}>
            {preview.title ?? shortenUrl(preview.url)}
          </Text>
          <Text size="xs" c="dimmed">
            {preview.host}
          </Text>
          {preview.description && (
            <Text size="xs" c="dimmed" lineClamp={2}>
              {preview.description}
            </Text>
          )}
        </Stack>
        {preview.image && !imageFailed && (
          // A plain <img> on purpose: preview images live on arbitrary third
          // hosts, which next/image could only load through a wildcard
          // remote-pattern — the SSRF gate already ran server-side.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview.image}
            alt=""
            aria-hidden
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            style={{
              width: 64,
              height: 64,
              objectFit: "cover",
              flexShrink: 0,
              borderRadius: "var(--mantine-radius-sm)",
            }}
          />
        )}
      </Group>
    </Paper>
  );
}
