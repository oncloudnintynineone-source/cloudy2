import { apiError, apiJson, readApiJson, withApiSession } from "@/lib/api/server";
import { mapSettled } from "@/lib/async";
import { fetchLinkPreview } from "@/lib/linkPreviews/fetch";
import { isSafePreviewUrl } from "@/lib/linkPreviews/safety";
import { MAX_PREVIEW_URLS } from "@/lib/linkPreviews/extract";
import type { LinkPreviewEntry } from "@/lib/linkPreviews/types";

/**
 * Link previews for URLs inside an event's remarks
 * (docs/event-lifecycle.md §1.12). A plain read route rather than a server
 * action, so a background preview fetch never queues ahead of the user's
 * next save or calendar read.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface PreviewRequestBody {
  urls?: unknown;
}

export async function POST(request: Request) {
  const auth = await withApiSession(request, { requireApiHeader: true });
  if (!auth.ok) {
    return auth.response;
  }
  const body = await readApiJson<PreviewRequestBody>(request);
  if (!body || !Array.isArray(body.urls)) {
    return apiError(400, "Invalid request");
  }
  // Re-validate every URL server-side (the client filter is courtesy, not
  // trust) and cap the fan-out regardless of what was asked for.
  const urls = body.urls
    .filter(
      (url): url is string =>
        typeof url === "string" && url.length <= 2048 && isSafePreviewUrl(url),
    )
    .slice(0, MAX_PREVIEW_URLS);
  const { results } = await mapSettled(urls, 4, (url) => fetchLinkPreview(url));
  const previews: LinkPreviewEntry[] = urls.map((url, index) => ({
    url,
    preview: results[index] ?? null,
  }));
  return apiJson({ previews });
}
