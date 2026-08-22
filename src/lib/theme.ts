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
  // The app's "desktop" layout (sidebar, tables, card grids) kicks in at 992px
  // — Mantine's `md`. `lg` is pinned to the same 62em so every `lg:` reference
  // (responsive props, `visibleFrom="lg"`, the AppShell navbar breakpoint, and
  // the `useMediaQuery` calls) stays consistent with the `@media (min-width:
  // 62em)` block in globals.css. Mantine's default `lg` is 75em (1200px).
  breakpoints: {
    xs: "36em",
    sm: "48em",
    md: "62em",
    lg: "62em",
    xl: "88em",
  },
  defaultRadius: "md",
  respectReducedMotion: true,
  components: {
    Input: {
      vars: () => ({
        wrapper: {
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
