/** A quick link (Settings → Quick Links) as rendered by the launcher menu. */
export interface QuickLinkMenuItem {
  id: string;
  label: string;
  url: string;
  icon: string;
  color: string | null;
}
