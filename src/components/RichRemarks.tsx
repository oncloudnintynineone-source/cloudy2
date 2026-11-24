"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, Group, Paper, Stack, Text } from "@mantine/core";
import { postJson } from "@/lib/api/client";
import { LinkifiedText } from "@/components/LinkifiedText";
import { CONTENT_ENTER_CLASS } from "@/lib/loading/contentEnter";
import {
  extractPreviewUrls,
  previewUrlFor,
  splitRemarksUrls,
} from "@/lib/linkPreviews/extract";
import { EXTERNAL_LINK_PROPS, isHttpUrl, shortenUrl } from "@/lib/ui/externalLink";
import type { LinkPreview, LinkPreviewEntry } from "@/lib/linkPreviews/types";

/**
 * The event's remarks rendered "rich" in the details modal
 * (docs/event-lifecycle.md §1.7.5): the text stays exactly as stored (plain
 * text — Google Calendar shows the same words), but URLs become real links
 * (opened in a new tab, http(s) only — `LinkifiedText`) and each linked page
 * gets a preview card fetched from `POST /api/link-preview`.
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
/**
 * Length past which remarks are guaranteed to clip even at the widest dialog
 * (440px at 14px type ≈ 6 lines of ~60 chars). A last-resort guarantee that a
 * long note always offers the toggle even when no measurement lands; a
 * redundant toggle on pathological narrow-glyph text is the accepted cost.
 */
const REMARKS_GUARANTEED_CLIP_CHARS = 420;

/** Per-page-load preview cache (null = fetched and failed; never retried). */
const previewCache = new Map<string, LinkPreview | null>();

export function RichRemarks({ text }: { text: string }) {
  const segments = useMemo(() => splitRemarksUrls(text), [text]);
  const urls = useMemo(() => extractPreviewUrls(text), [text]);
  // The author's own href per preview key, so a card whose page was linked with
  // a `#fragment` still lands on that fragment (the preview key drops it).
  const previewHrefs = useMemo(() => {
    const hrefs = new Map<string, string>();
    for (const segment of segments) {
      if (segment.kind !== "link") {
        continue;
      }
      const key = previewUrlFor(segment.href);
      if (!hrefs.has(key)) {
        hrefs.set(key, segment.href);
      }
    }
    return hrefs;
  }, [segments]);
  // Re-render trigger once the module cache fills (the cache itself is read
  // directly during render, so no state mirrors it).
  const [, setCacheVersion] = useState(0);
  // Collapsed by default (D22); a new event's remarks start collapsed too —
  // the modal is keepMounted, so the reset rides the text change in render.
  // `clipped` resets with it, so a previous event's verdict can never leak
  // onto a short note.
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const [prevText, setPrevText] = useState(text);
  if (text !== prevText) {
    setPrevText(text);
    setExpanded(false);
    setClipped(false);
  }
  // The toggle only earns its place when the clamped text actually clips —
  // measured, not guessed from length (wrapping depends on the modal width).
  // Two traps this measurement must survive, and used to fall into:
  //   1. `scrollHeight` on a `-webkit-box` clamp is browser-dependent (some
  //      builds report the clamped height), so the clamp is lifted for one
  //      synchronous read instead;
  //   2. the modal's Transition renders its kept-mounted content with
  //      `display: none` for the first frames of every open (status moves from
  //      "exited" to "entering" two animation frames after `mounted` flips), so
  //      a one-shot read in that window sees 0/0 and silently hides the toggle
  //      for the whole event. Hence: never record a read from a laid-out-less
  //      box, and re-measure from a ResizeObserver the moment the box appears
  //      (also covering the xs→md modal resize and font reflows).
  const textRef = useRef<HTMLParagraphElement>(null);
  const measureClip = useCallback(() => {
    const el = textRef.current;
    if (!el || expanded) {
      return;
    }
    // Not laid out (the Transition's `display: none` window, or the dialog
    // while it is closed): never record that as "does not clip".
    if (el.offsetHeight === 0) {
      return;
    }
    const clamped = el.offsetHeight;
    el.style.webkitLineClamp = "unset";
    const full = el.offsetHeight;
    el.style.webkitLineClamp = "";
    const next = full > clamped + 1;
    // Same-value writes bail out, so the observer can never loop.
    setClipped((prev) => (prev === next ? prev : next));
  }, [expanded]);

  useLayoutEffect(() => {
    measureClip();
  }, [measureClip, text]);

  useEffect(() => {
    const el = textRef.current;
    if (!el || typeof ResizeObserver !== "function") {
      return;
    }
    const observer = new ResizeObserver(() => measureClip());
    observer.observe(el);
    return () => observer.disconnect();
  }, [measureClip]);

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

  // Read straight from the cache during render (the version state above is only
  // the re-render trigger), pairing each card with the href to open: the
  // author's own link when there is one, else the server's final URL.
  const cards = urls.flatMap((url) => {
    const preview = previewCache.get(url);
    return preview ? [{ key: url, href: previewHrefs.get(url) ?? preview.url, preview }] : [];
  });
  const visibleCards = expanded ? cards : cards.slice(0, PREVIEW_CARD_CAP);
  const overflowCards = cards.length - visibleCards.length;

  return (
    <Stack gap="xs">
      <Text
        size="sm"
        ref={textRef}
        lineClamp={expanded ? undefined : REMARKS_LINE_CLAMP}
        style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
      >
        <LinkifiedText text={text} segments={segments} />
      </Text>
      {visibleCards.length > 0 && (
        <Stack gap={6} className={CONTENT_ENTER_CLASS}>
          {visibleCards.map((card) => (
            <PreviewCard key={card.key} preview={card.preview} href={card.href} />
          ))}
        </Stack>
      )}
      {(expanded ||
        clipped ||
        overflowCards > 0 ||
        text.length >= REMARKS_GUARANTEED_CLIP_CHARS) && (
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
function PreviewCard({ preview, href }: { preview: LinkPreview; href: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const label = preview.title ? `Open ${preview.title} (${preview.host})` : `Open ${preview.host}`;
  // Render-time allowlist (defense in depth: the extractor allowlists authored
  // links and the SSRF gate vetted this one server-side). Anything that is not
  // http(s) renders as a plain, non-interactive card instead of an anchor.
  const image = preview.image && isHttpUrl(preview.image) ? preview.image : null;
  const cardProps = {
    withBorder: true,
    radius: "sm",
    p: "xs",
    style: { display: "block", textDecoration: "none" },
  } as const;
  const content = (
    <Group gap="sm" wrap="nowrap">
      <Stack gap={2} flex="1" style={{ minWidth: 0 }}>
        <Text size="sm" fw={500} lineClamp={2}>
          {preview.title ?? shortenUrl(href)}
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
      {image && !imageFailed && (
        // A plain <img> on purpose: preview images live on arbitrary third
        // hosts, which next/image could only load through a wildcard
        // remote-pattern — the SSRF gate already ran server-side.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
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
  );
  if (!isHttpUrl(href)) {
    return <Paper {...cardProps}>{content}</Paper>;
  }
  return (
    <Paper {...cardProps} component="a" href={href} {...EXTERNAL_LINK_PROPS} aria-label={label}>
      {content}
    </Paper>
  );
}
