"use client";

import { ActionIcon, useMantineColorScheme } from "@mantine/core";
import { useMounted } from "@mantine/hooks";
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
  const mounted = useMounted();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const scheme = (colorScheme in NEXT_SCHEME ? colorScheme : "auto") as Scheme;
  const Icon = SCHEME_ICONS[scheme];

  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label={mounted ? SCHEME_LABELS[scheme] : "Switch theme"}
      onClick={() => setColorScheme(NEXT_SCHEME[scheme])}
    >
      {mounted ? <Icon size={18} /> : <IconSun size={18} />}
    </ActionIcon>
  );
}
