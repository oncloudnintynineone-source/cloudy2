import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveMotion, motionCssText, motionStyleVars, STANDARD_MOTION } from "./profile";
import { BASE_DURATIONS_MS } from "./tokens";

describe("resolveMotion", () => {
  it("scales every duration by the profile speed", () => {
    const calm = resolveMotion("calm");
    expect(calm.duration.standard).toBe(Math.round(BASE_DURATIONS_MS.standard * 1.2));
    expect(calm.duration.micro).toBe(Math.round(BASE_DURATIONS_MS.micro * 1.2));
  });

  it("collapses every duration to instant when disabled", () => {
    const disabled = resolveMotion("playful", { disabled: true });
    for (const value of Object.values(disabled.duration)) {
      expect(value).toBe(0);
    }
    expect(disabled.stagger).toBe(0);
  });

  it("scales travel distance and stagger", () => {
    const playful = resolveMotion("playful");
    expect(playful.distance.md).toBe(Math.round(16 * 1.15));
    expect(playful.stagger).toBe(Math.round(40 * 1.1));
  });

  it("produces a bounce-free pop curve when bounce is 0", () => {
    const snappy = resolveMotion("snappy");
    expect(snappy.easingCurves.pop).toEqual([0.34, 1, 0.64, 1]);
    expect(snappy.easing.pop).toBe("cubic-bezier(0.34, 1, 0.64, 1)");
  });

  it("falls back to standard for an unknown profile", () => {
    const resolved = resolveMotion("standard");
    expect(resolved.profile).toBe("standard");
    expect(resolved.duration.standard).toBe(STANDARD_MOTION.duration.standard);
  });
});

describe("motionCssText", () => {
  it("publishes the standard durations and easings as :root custom properties", () => {
    const css = motionCssText(STANDARD_MOTION);
    expect(css).toMatch(/^:root:root \{/);
    expect(css).toContain("--c2-dur-standard: 220ms;");
    expect(css).toContain("--c2-ease-out: cubic-bezier(0.22, 1, 0.36, 1);");
    expect(css).toContain("--c2-dist-md: 16px;");
    expect(css).toContain("--c2-scale-chip: 0.94;");
    expect(css).toContain("--c2-stagger: 40ms;");
  });
});

describe("motionStyleVars", () => {
  it("mirrors the CSS text as an inline style object", () => {
    const vars = motionStyleVars(STANDARD_MOTION);
    expect(vars["--c2-dur-standard"]).toBe("220ms");
    expect(vars["--c2-ease-pop"]).toBe(STANDARD_MOTION.easing.pop);
  });
});

describe("standard :root parity", () => {
  it("the globals.css fallback block matches STANDARD_MOTION", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    const block = css.match(/:root \{[\s\S]*?\}/)?.[0] ?? "";
    const varMap: Record<string, string> = {};
    for (const [, name, value] of block.matchAll(/--(c2-[a-zA-Z]+(?:-[a-zA-Z]+)*):\s*([^;]+);/g)) {
      varMap[name] = value.trim();
    }
    for (const [key, value] of Object.entries(STANDARD_MOTION.duration)) {
      expect(varMap[`c2-dur-${key}`]).toBe(`${value}ms`);
    }
    expect(varMap["c2-ease-out"]).toBe(STANDARD_MOTION.easing.out);
    expect(varMap["c2-ease-in"]).toBe(STANDARD_MOTION.easing.in);
    expect(varMap["c2-ease-in-out"]).toBe(STANDARD_MOTION.easing.inOut);
    expect(varMap["c2-ease-emphasized"]).toBe(STANDARD_MOTION.easing.emphasized);
    expect(varMap["c2-ease-pop"]).toBe(STANDARD_MOTION.easing.pop);
    expect(varMap["c2-ease-linear"]).toBe(STANDARD_MOTION.easing.linear);
    for (const [key, value] of Object.entries(STANDARD_MOTION.distance)) {
      expect(varMap[`c2-dist-${key}`]).toBe(`${value}px`);
    }
    for (const [key, value] of Object.entries(STANDARD_MOTION.scale)) {
      expect(varMap[`c2-scale-${key}`]).toBe(`${value}`);
    }
    expect(varMap["c2-stagger"]).toBe(`${STANDARD_MOTION.stagger}ms`);
  });
});
