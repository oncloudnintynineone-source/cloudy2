"use client";

import { createContext, useContext, type ReactNode } from "react";

import { STANDARD_MOTION, type MotionTokens } from "@/lib/motion/profile";

/**
 * Carries the resolved motion tokens down the client tree so every Mantine
 * `transitionProps` and JS tween reads the same numbers the CSS custom
 * properties carry. The server-resolved `motionProfile` feature flag is passed
 * in from the protected layout; components that run outside it (e.g. `/login`)
 * fall back to the standard profile, matching the `:root` defaults in
 * `globals.css`.
 */
const MotionContext = createContext<MotionTokens>(STANDARD_MOTION);

export function MotionProvider({
  motion,
  children,
}: {
  motion: MotionTokens;
  children: ReactNode;
}) {
  return <MotionContext.Provider value={motion}>{children}</MotionContext.Provider>;
}

/** The active motion tokens for the current profile. */
export function useMotion(): MotionTokens {
  return useContext(MotionContext);
}
