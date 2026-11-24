"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Anchor, Button, Group, Paper, Stack, Text } from "@mantine/core";
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
 *
 * Long remarks are clamped (docs/ui-ux-improvements.md D22): the text shows
 * at most {@link REMARKS_LINE_CLAMP} lines and at most
 * {@link PREVIEW_CARD_CAP} cards until **Show more** — the details modal's
 * action footer is sticky, but a wall of remarks still buries everything else
 * on the one surface the user came to read.
 */

/** Lines of remarks text shown while collapsed. */
const REMARKS_LINE_CLAMP = 6;
/** Preview cards shown while collapsed. */
const PREVIEW_CARD_CAP = 2;

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
  // Collapsed by default (D22); a new event's remarks start collapsed too —
  // the modal is keepMounted, so the reset rides the text change in render.
  const [expanded, setExpanded] = useState(false);
  const [prevText, setPrevText] = useState(text);
  if (text !== prevText) {
    setPrevText(text);
    setExpanded(false);
  }
  // The toggle only earns its place when the clamped text actually clips —
  // measured, not guessed from length (wrapping depends on the modal width).
  // `scrollHeight` on a `-webkit-box` clamp is browser-dependent (some builds
  // report the clamped height), so measure deterministically instead: lift the
  // clamp for one synchronous read. A layout effect runs before paint, so the
  // unclamped frame is never visible; this component only ever renders inside
  // the `ssr: false` detail-body chunk, so the effect is SSR-safe.
  const textRef = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);
  useLayoutEffect(() => {
    const el = textRef.current;
    if (!el || expanded) {
      return;
    }
    const clamped = el.offsetHeight;
    el.style.webkitLineClamp = "unset";
    const full = el.offsetHeight;
    el.style.webkitLineClamp = "";
    setClipped(full > clamped + 1);
  }, [text, expanded]);

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
  const visiblePreviews = expanded ? previews : previews.slice(0, PREVIEW_CARD_CAP);
  const overflowCards = previews.length - visiblePreviews.length;

  return (
    <Stack gap="xs">
      <Text
        size="sm"
        ref={textRef}
        lineClamp={expanded ? undefined : REMARKS_LINE_CLAMP}
        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      >
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
      {visiblePreviews.length > 0 && (
        <Stack gap={6} className={CONTENT_ENTER_CLASS}>
          {visiblePreviews.map((preview) => (
            <PreviewCard key={preview.url} preview={preview} />
          ))}
        </Stack>
      )}
      {(expanded || clipped || overflowCards > 0) && (
        <Button
          variant="subtle"
          size="compact-xs"
          w="fit-content"
          aria-expanded={expanded}
          aria-label={expanded ? "Show fewer remarks" : "Show full remarks"}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
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
