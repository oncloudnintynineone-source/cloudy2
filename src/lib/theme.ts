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
    Modal: {
      // Mobile: size the dialog off `svh` (the constant smallest viewport)
      // instead of Mantine's `dvh`, which changes when the browser toolbar or
      // keyboard appears. A `dvh` change re-layouts and re-centers the box
      // while a Select inside it is being focused, feeding the focus-scroll
      // jump loop (see useContainModalFocusScroll).
      styles: {
        content: {
          maxHeight: "calc(100svh - var(--modal-y-offset) * 2)",
        },
      },
      vars: () => ({
        root: {
          "--modal-y-offset": "5svh",
        },
      }),
    },
  },
});

/** Shared loader styling for Buttons that trigger async work. */
export const BUTTON_LOADER_PROPS: NonNullable<ButtonProps["loaderProps"]> = {
  type: "oval",
};
