import { createContext, useContext } from "react";

import type { Rect } from "@/lib/motion/origin";

/**
 * Event search modal for the Calendar: the shell owns the open/close state
 * (it renders the header trigger) and pages read it through
 * `useSearchPanel()`. Opening is a transient client state — never persisted.
 * On the calendar page below `lg` the trigger lives in the floating bottom
 * control pill instead of the header; the pill opens the shell-owned modal
 * through this context.
 */
export interface SearchPanelValue {
  /** Opens the modal, given the tapped trigger's rect for the zoom origin. */
  openSearch: (originRect: Rect | null) => void;
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
