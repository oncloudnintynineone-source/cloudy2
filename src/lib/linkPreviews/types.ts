/**
 * The shape shared by the preview fetcher, the API route and the client
 * renderer. Kept free of server imports so client components can use it.
 */
export interface LinkPreview {
  /** The URL the preview describes (the final URL after redirects). */
  url: string;
  /** Display host of that final URL. */
  host: string;
  title?: string;
  description?: string;
  /** Absolute image URL, already SSR-validated. */
  image?: string;
  siteName?: string;
}

/** One requested URL and its preview (null: unsafe, unfetchable, no meta). */
export interface LinkPreviewEntry {
  url: string;
  preview: LinkPreview | null;
}
