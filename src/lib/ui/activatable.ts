import type { KeyboardEvent } from "react";

/**
 * Props that make a non-semantic click target (a Paper card or table row)
 * operable from the keyboard: it is exposed as a `role="button"` and Enter /
 * Space activate it (Space also has its default page-scroll suppressed).
 * Spread alongside the element's existing `onClick`, which stays responsible
 * for pointer activation.
 */
export function activatable(onActivate: () => void): {
  role: "button";
  tabIndex: 0;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
} {
  return {
    role: "button",
    tabIndex: 0,
    onKeyDown: (event) => {
      if (event.target !== event.currentTarget) {
        // Focus sits on an interactive child (button/input); let it handle
        // the key so Enter on an inner control can't double-fire the row.
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate();
      }
    },
  };
}
