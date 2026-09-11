import { createTheme, type ButtonProps, type MantineColorsTuple } from "@mantine/core";

const brand: MantineColorsTuple = [
  "#eef4fd",
  "#dbe6fa",
  "#b4c9ef",
  "#8ca8e2",
  "#6385cf",
  "#3f66bd",
  "#1e4faf",
  "#0D47A1",
  "#0a3a85",
  "#072d66",
];

const accent: MantineColorsTuple = [
  "#fff9e0",
  "#fff3c0",
  "#ffe793",
  "#ffd95f",
  "#ffcf3d",
  "#fbc632",
  "#FBC02D",
  "#d9a600",
  "#ad8200",
  "#806100",
];

export const theme = createTheme({
  primaryColor: "brand",
  colors: {
    brand,
    accent,
  },
  // The app's "desktop" layout (sidebar, tables, card grids) kicks in at 640px
  // — the width of an unfolded foldable's inner screen (Galaxy Z Fold ≈ 653px,
  // Pixel Fold ≈ 640px). `md`/`lg` are pinned to the same 40em so every `lg:`
  // reference (responsive props, `visibleFrom="lg"`, the AppShell navbar
  // breakpoint, and the `useMediaQuery` calls) stays consistent with the
  // `@media (min-width: 40em)` block in globals.css. Mantine's default `lg` is
  // 75em (1200px). Note: 40em sits *below* `sm` (48em) — the generated media
  // queries are sorted by width so nothing breaks, but the names read in
  // reverse: prefer `lg:` for every desktop-band prop and avoid mixing `sm:`
  // and `md:` in one responsive value.
  breakpoints: {
    xs: "36em",
    sm: "48em",
    md: "40em",
    lg: "40em",
    xl: "88em",
  },
  defaultRadius: "md",
  respectReducedMotion: true,
  components: {
    Input: {
      vars: () => ({
        wrapper: {
          // >= 16px so iOS Safari doesn't auto-zoom the page when an input
          // is focused (it magnifies any field with a smaller font-size).
          "--input-fz": "var(--mantine-font-size-md)",
          "--input-height-xs": "calc(2.25rem * var(--mantine-scale))",
          "--input-height-sm": "calc(2.7rem * var(--mantine-scale))",
          "--input-height-md": "calc(3.15rem * var(--mantine-scale))",
          "--input-height-lg": "calc(3.75rem * var(--mantine-scale))",
          "--input-height-xl": "calc(4.5rem * var(--mantine-scale))",
        },
      }),
    },
  },
});

/** Shared loader styling for Buttons that trigger async work. */
export const BUTTON_LOADER_PROPS: NonNullable<ButtonProps["loaderProps"]> = {
  type: "oval",
};

/**
 * Media query for the app's desktop layout. Kept alongside the pinned
 * `breakpoints.lg` above so JS matchMedia calls (`useMediaQuery`) and Mantine
 * responsive props can't drift apart.
 */
export const DESKTOP_MEDIA_QUERY = "(min-width: 40em)";

/**
 * Media query for the "wide desktop" band (≥ 800px). The desktop shell starts
 * at 640px for unfolded foldables, but at 640–799px the 240px full sidebar
 * would eat a third of the viewport, so the shell auto-collapses it to the
 * 64px icon rail until this width is reached (AppShellShell.tsx).
 */
export const DESKTOP_WIDE_MEDIA_QUERY = "(min-width: 50em)";

/**
 * Media query for the "compact" tier — very small form-factor phones
 * (≤ 360px: iPhone SE 1st gen, Galaxy Fold cover, small Androids). Below this
 * the mobile layout's fixed chrome (header button rows, bottom-nav labels,
 * `sm` modals) starts overflowing, so components that hold fixed-width
 * controls drop to tighter variants. Deliberately *above* Mantine's smallest
 * breakpoint (xs = 36em): `useMediaQuery` only matches a JS query, and this
 * query has no theme counterpart — it must not collide with any `xs:`
 * responsive prop (those mean ≥ 576px).
 */
export const NARROW_MEDIA_QUERY = "(max-width: 22.5em)";

/**
 * Media query matching touch-first devices (coarse pointer). Used to show
 * touch-only affordances like the agenda swipe hint, which would be noise on
 * a desktop mouse.
 */
export const COARSE_POINTER_MEDIA_QUERY = "(pointer: coarse)";
