# 1. Motion System

A single, tunable animation language for the whole app. Every transition,
reveal and modal zoom reads one shared set of tokens — durations, easing curves,
travel distances, scale factors and a sibling stagger — so the app can be
re-tuned in one place and an admin can switch the whole app's cadence live via
the `motionProfile` feature flag.

## Table of contents

- [1.1 Why one system](#11-why-one-system)
- [1.2 The token model](#12-the-token-model)
- [1.3 Profiles](#13-profiles)
- [1.4 How the profile reaches CSS and JS](#14-how-the-profile-reaches-css-and-js)
- [1.5 Reduced motion & low-end devices](#15-reduced-motion--low-end-devices)
- [1.6 Smoothness audit](#16-smoothness-audit)
- [1.7 Adding or moving an animation](#17-adding-or-moving-an-animation)
- [1.8 File index & related docs](#18-file-index--related-docs)

## 1.1 Why one system

Before this, durations lived in a `MOTION` object (`src/lib/motion/timing.ts`)
with a compile-time `MOTION_SCALE`, and CSS hardcoded its own `ms`/`ease`
literals in dozens of places. That made the app impossible to re-tune at
runtime and left the CSS and JS clocks drifting apart (the grid zoom tween
animating against CSS transitions it couldn't see).

The new system keeps one source of truth (`src/lib/motion/tokens.ts`) and a
runtime scaling layer (`src/lib/motion/profile.ts`):

```mermaid
flowchart LR
  T[tokens.ts<br/>base durations/easings/distances] --> P[profile.ts<br/>resolveMotion scales them]
  P --> CSS[motionCssText → :root:root vars]
  P --> JS[MotionProvider → useMotion()]
  CSS --> G[globals.css reads --c2-*]
  JS --> M[Mantine transitionProps / WAAPI / FLIP / zoom tween]
```

Nothing outside these modules may hardcode a duration, easing curve or travel
distance.

## 1.2 The token model

`src/lib/motion/tokens.ts` defines the *standard* profile's raw numbers:

| Group | Keys | Notes |
| ---- | ---- | ---- |
| Durations (ms) | `instant`, `micro`, `quick`, `standard`, `emphasized`, `deliberate`, `ambient`, `spin`, `popover`, `modalZoom`, `modalZoomExit`, `modalForm`, `fade`, `zoom`, `pillProgress` | each names the *role* the animation plays |
| Easings (cubic-bezier) | `out`, `in`, `inOut`, `emphasized`, `pop`, `linear` | `pop` is the entrance overshoot built from `bounce` |
| Distances (px) | `xs`, `sm`, `md`, `lg`, `xl` | slide/rise keyframes and WAAPI tweens |
| Scales | `chip`, `pop`, `fab`, `badge`, `badgePeak`, `tabActive` | pop/settle animations |
| Stagger (ms) | `40` base | sibling entrance offsets (FAB cluster) |

`cubicBezier(curve)` in the same file is a Newton–Raphson evaluator so a
JS-driven tween (the grid zoom) can follow the *literal* CSS curve instead of
drifting against CSS transitions still in flight.

## 1.3 Profiles

`resolveMotion(profile)` scales the base tokens. A profile carries four knobs:
`speed` (multiplies every duration), `distance` (multiplies every travel),
`stagger` (multiplies the sibling offset) and `bounce` (0–1 overshoot), plus an
`outCurve` easing family.

| Profile | speed | distance | stagger | bounce | feel |
| ---- | ---- | ---- | ---- | ---- | ---- |
| `calm` | 1.2 | 1 | 1.25 | 0 | slower, softer, no overshoot |
| `standard` (default) | 1 | 1 | 1 | 0.45 | tuned default |
| `snappy` | 0.8 | 0.8 | 0.75 | 0 | fast, crisp, no overshoot |
| `playful` | 1 | 1.15 | 1.1 | 1 | travels further, springier pop |

`bounce` becomes the `pop` curve `[0.34, 1 + 0.4·bounce, 0.64, 1]` — a y2
overshoot. Overshoot is only ever applied to **entrances**; exits stay on the
non-bouncy curves so modals never snap back.

`STANDARD_MOTION` is the pre-hydration fallback and the `/login` default (login
is intentionally hardcoded to standard). A parity test
(`src/lib/motion/profile.test.ts`) asserts the `:root` block in `globals.css`
matches `STANDARD_MOTION` exactly.

## 1.4 How the profile reaches CSS and JS

The `(protected)` layout resolves the flag and publishes it two ways:

1. **Server-rendered CSS:** `motionCssText(tokens)` emits a
   `:root:root { --c2-dur-standard: 220ms; … }` block. `:root:root` (specificity
   0,2,0) beats the plain `:root` fallback in `globals.css`, so the active
   profile always wins — with no hydration flash.
2. **React context:** `MotionProvider` (`src/components/MotionProvider.tsx`)
   exposes `useMotion()` returning the same `MotionTokens` as numbers/strings,
   because Mantine `transitionProps` needs a numeric duration and a
   timing-function string, and WAAPI/FLIP/zoom tweens need numbers.

`src/lib/motion/transitions.ts` turns the tokens into the shared Mantine
transition factories (`modalZoomTransitionProps`, `modalFormTransitionProps`,
`popoverTransitionProps`, …) so every modal/menu uses the same clock.

## 1.5 Reduced motion & low-end devices

A profile can never re-enable motion for users who opted out:

- `prefers-reduced-motion: reduce` collapses CSS animations/transitions to a
  hard cut (`animation-duration: 0s !important`, etc.).
- `c2-low-end` (added by `AppProviders` on weak devices) does the same.
- In JS, `resolveMotion(profile, { disabled: true })` sets every duration to
  `instant` (0 ms), so tweens snap. `flipReorder` and the zoom tween check
  `useMotion().duration.standard === 0` / the low-end class and skip the work.

## 1.6 Smoothness audit

The audit replaced the rough edges that made motion feel jerky:

| Before | After | Why |
| ---- | ---- | ---- |
| Activity bar animated `height` | `transform: scaleY` | layout-triggering height animation is janky; transform is GPU-cheap |
| `content-enter` reveal | shortened to `quick` | content appeared too slowly |
| FAB/chip entrances | `pop` easing | felt flat without a settle |
| Modal exits | non-bouncy curves | overshoot on exit looked like a bounce-back |
| Badge tick, rail nudge, clash rows, pill progress | tokenized durations/easings | raw `120ms ease`/`500ms` literals drifted from the system |

Layout-inherent motion (banner height, dual-pane gutter) stays but reads from
the tokens.

## 1.7 Adding or moving an animation

- **CSS:** reference `var(--c2-dur-*)`, `var(--c2-ease-*)`, `var(--c2-dist-*)`,
  `var(--c2-scale-*)` — never a raw `ms` or `cubic-bezier(...)`.
- **Mantine:** use a factory from `src/lib/motion/transitions.ts` (or
  `useMotion()` for a one-off `transitionDuration`).
- **JS tween:** pass `useMotion()` into the tween and use `cubicBezier(motion.easingCurves.out)`
  so the curve matches the CSS.

## 1.8 File index & related docs

| File | Role |
| ---- | ---- |
| `src/lib/motion/tokens.ts` | base durations/easings/distances/scales + `cubicBezier` evaluator |
| `src/lib/motion/profile.ts` | profiles, `resolveMotion`, `motionCssText`, `motionStyleVars`, `STANDARD_MOTION` |
| `src/lib/motion/transitions.ts` | shared Mantine transition factories |
| `src/components/MotionProvider.tsx` | `useMotion()` context |
| `src/app/(protected)/layout.tsx` | resolves `motionProfile`, publishes `:root:root` vars, wraps in `MotionProvider` |
| `src/app/globals.css` | standard `:root` fallback + every `--c2-*` consumer |
| `src/lib/motion/profile.test.ts` | profile scaling + CSS parity |

Related docs:

- [`feature-flags.md`](feature-flags.md) — the `motionProfile` flag registry.
- [`loading-transitions.md`](loading-transitions.md) — skeletons, the activity
  bar and cold-start readiness (all now token-driven).
- [`accessibility.md`](accessibility.md) — reduced-motion tiers.