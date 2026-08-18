import { BOTTOM_NAV_HEIGHT } from "@/lib/bottomNav";

/** Content clearance for the Settings pages: its own sub-tab bar (52px) above the global bottom nav, plus the usual 16px margin. */
export const SETTINGS_TAB_BAR_OFFSET = `calc(${52 + BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom) + 16px)`;
