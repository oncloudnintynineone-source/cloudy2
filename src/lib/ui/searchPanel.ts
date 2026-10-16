import { createContext, useContext } from "react";

import type { Rect } from "@/lib/motion/origin";

/**
 * Event search modal for the Calendar: the shell owns the open/close state and
 * pages read it through `useSearchPanel()`. Opening is a transient client state
 * — never persisted. The triggers live on the calendar page only: the nav-row
 * squircle beside "New event" at `lg`+, and the floating bottom control pill
 * below `lg`.
 */
export interface SearchPanelValue {
  /** Opens the modal, given the tapped trigger's rect for the zoom origin. */
  openSearch: (originRect: Rect | null) => void;
  /** Warms the lazy modal chunk (hover/focus on a trigger) so the first open is instant. */
  preloadSearch: () => void;
}

export const SearchPanelContext = createContext<SearchPanelValue | null>(null);

/** Reads the search modal controls; throws outside the AppShellShell provider. */
export function useSearchPanel(): SearchPanelValue {
  const value = useContext(SearchPanelContext);
  if (value === null) {
    throw new Error("useSearchPanel must be used within the AppShellShell provider");
  }
  return value;
}
