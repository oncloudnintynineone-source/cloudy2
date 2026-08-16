"use client";

import { ActionIcon, useMantineColorScheme } from "@mantine/core";
import { IconMoon, IconSun, IconSunMoon } from "@tabler/icons-react";

const NEXT_SCHEME = { light: "dark", dark: "auto", auto: "light" } as const;

type Scheme = keyof typeof NEXT_SCHEME;

const SCHEME_ICONS = { light: IconSun, dark: IconMoon, auto: IconSunMoon } as const;

const SCHEME_LABELS = {
  light: "Switch to dark theme",
  dark: "Switch to system theme",
  auto: "Switch to light theme",
} as const;

export function ThemeToggle() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const scheme = (colorScheme in NEXT_SCHEME ? colorScheme : "auto") as Scheme;
  const Icon = SCHEME_ICONS[scheme];

  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label={SCHEME_LABELS[scheme]}
      onClick={() => setColorScheme(NEXT_SCHEME[scheme])}
    >
      <Icon size={18} />
    </ActionIcon>
  );
}
