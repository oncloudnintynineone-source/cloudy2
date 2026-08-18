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
