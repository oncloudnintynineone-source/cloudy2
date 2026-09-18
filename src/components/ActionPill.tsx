"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * Bespoke actionable toast: a pill-shaped button floating at the bottom of the
 * screen. It replaces the ad-hoc Mantine `notifications.show({ message: <Button/> })`
 * "View event" toast (EventForm) with a reusable, themeable control.
 *
 * Two-tone: the pill body is a darker color and a lighter fill sweeps across it
 * as a progress indicator. The fill either *empties* (countdown — starts full,
 * drains to nothing, then auto-dismisses) or *fills* (starts empty, grows to
 * full, then persists until dismissed/actioned). Clicking the pill runs the
 * configured action and dismisses it. Colors default to the project brand blue
 * (light `--mantine-color-brand-3` #8ca8e2 over dark `--mantine-color-brand-7`
 * #0D47A1); each call may override both.
 */

export type ActionPillDirection = "empty" | "fill";

export type ActionPillVariant = "default" | "toast";

export interface ActionPillOptions {
  /** Action verb shown on the pill (e.g. "View event"). */
  label: string;
  /** Optional short context line rendered above the label (e.g. "Event created"). */
  title?: string;
  /** Runs when the pill is clicked (the pill dismisses itself first). */
  onAction: () => void;
  /** Auto-dismiss/progress timing in ms. Default 5000. */
  duration?: number;
  /**
   * Progress direction. "empty" (default) = countdown: the light fill drains to
   * nothing over `duration`, then the pill auto-dismisses. "fill" = the light
   * fill grows to full over `duration`, then persists until dismissed/actioned.
   */
  direction?: ActionPillDirection;
  /**
   * Presentation variant. "default" is the classic two-tone pill with the
   * progress sweep. "toast" reads as a confirmation, not a countdown: light
   * surface + border, a green success rail, no sweep fill, single-line copy,
   * and it nests into the notification corners (top-center on mobile,
   * bottom-right on desktop) instead of bottom-center. The "empty" auto-dismiss
   * timer still runs.
   */
  variant?: ActionPillVariant;
  /** Lighter progress-fill color. Default `var(--mantine-color-brand-3)`. */
  lightColor?: string;
  /** Darker pill-body color. Default `var(--mantine-color-brand-7)`. */
  darkColor?: string;
}

interface ResolvedOptions {
  label: string;
  title?: string;
  onAction: () => void;
  duration: number;
  direction: ActionPillDirection;
  variant: ActionPillVariant;
  lightColor: string;
  darkColor: string;
}

interface ActivePill {
  id: string;
  options: ResolvedOptions;
}

interface ActionPillValue {
  /** Show a pill, replacing any current one. Returns an id for `dismiss`. */
  show: (options: ActionPillOptions) => string;
  /** Dismiss the current pill (or the given id). Starts the exit transition. */
  dismiss: (id?: string) => void;
}

const ActionPillContext = createContext<ActionPillValue | null>(null);

/** Reads the action-pill controls; throws outside the provider. */
export function useActionPill(): ActionPillValue {
  const value = useContext(ActionPillContext);
  if (value === null) {
    throw new Error("useActionPill must be used within ActionPillProvider");
  }
  return value;
}

const DEFAULT_DURATION_MS = 5000;
const DEFAULT_LIGHT = "var(--mantine-color-brand-3)";
const DEFAULT_DARK = "var(--mantine-color-brand-7)";
/** Exit fade/slide duration; the pill stays mounted this long after dismissal. */
const EXIT_MS = 200;

let nextId = 0;

/**
 * Context provider + host for the floating action pill. Mount once at the app
 * root (AppProviders) so the hook is usable anywhere and the pill survives
 * route navigations.
 */
export function ActionPillProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ActivePill | null>(null);
  const [closing, setClosing] = useState(false);
  const timers = useRef<{ exit: number | null; auto: number | null }>({ exit: null, auto: null });

  const clearExit = useCallback(() => {
    if (timers.current.exit !== null) {
      window.clearTimeout(timers.current.exit);
      timers.current.exit = null;
    }
  }, []);

  const clearAuto = useCallback(() => {
    if (timers.current.auto !== null) {
      window.clearTimeout(timers.current.auto);
      timers.current.auto = null;
    }
  }, []);

  const dismiss = useCallback(
    (id?: string) => {
      if (!current) return;
      if (id !== undefined && current.id !== id) return;
      clearAuto();
      clearExit();
      setClosing(true);
      timers.current.exit = window.setTimeout(() => {
        timers.current.exit = null;
        setClosing(false);
        setCurrent(null);
      }, EXIT_MS);
    },
    [current, clearAuto, clearExit],
  );

  const show = useCallback(
    (options: ActionPillOptions): string => {
      clearAuto();
      clearExit();
      const id = `action-pill-${++nextId}`;
      setClosing(false);
      setCurrent({
        id,
        options: {
          label: options.label,
          title: options.title,
          onAction: options.onAction,
          duration: options.duration ?? DEFAULT_DURATION_MS,
          direction: options.direction ?? "empty",
          variant: options.variant ?? "default",
          lightColor: options.lightColor ?? DEFAULT_LIGHT,
          darkColor: options.darkColor ?? DEFAULT_DARK,
        },
      });
      return id;
    },
    [clearAuto, clearExit],
  );

  // Auto-dismiss only the "empty" (countdown) direction once its fill drains.
  useEffect(() => {
    if (!current || current.options.direction !== "empty") return;
    clearAuto();
    timers.current.auto = window.setTimeout(() => dismiss(current.id), current.options.duration);
    return () => clearAuto();
  }, [current, clearAuto, dismiss]);

  // Clear any pending timers on unmount.
  useEffect(() => {
    return () => {
      clearAuto();
      clearExit();
    };
  }, [clearAuto, clearExit]);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ActionPillContext.Provider value={value}>
      {children}
      {current && (
        <ActionPillView
          key={current.id}
          active={current}
          closing={closing}
          onDismiss={() => dismiss(current.id)}
        />
      )}
    </ActionPillContext.Provider>
  );
}

interface ActionPillViewProps {
  active: ActivePill;
  closing: boolean;
  onDismiss: () => void;
}

/**
 * The pill itself. In the "default" variant the body is the dark color and a
 * light fill sweeps across as the progress indicator — legibility is kept on
 * both tones by rendering the copy twice (white over the dark body, and a dark
 * copy clipped to the light fill). The "toast" variant drops the sweep and the
 * two-tone layers: it renders as a confirmation — light surface, green success
 * rail, single-line copy filling both colors' roles with plain text.
 */
function ActionPillView({ active, closing, onDismiss }: ActionPillViewProps) {
  const { options } = active;
  const toast = options.variant === "toast";
  const start = options.direction === "fill" ? 0 : 100;
  const end = options.direction === "fill" ? 100 : 0;
  const [progress, setProgress] = useState(start);

  // Advance to the target on the next frame so the CSS `transition` on the
  // fill's clip-path drives the sweep. `progress` is already `start` on mount
  // (the view is keyed by the pill id, so it remounts per `show`).
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setProgress(end));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [end]);

  const handleClick = () => {
    onDismiss();
    options.onAction();
  };

  const copy = (
    <>
      {options.title ? <span className="c2-action-pill-title">{options.title}</span> : null}
      <span className="c2-action-pill-label">{options.label}</span>
    </>
  );

  const style = {
    "--c2-pill-dark": options.darkColor,
    "--c2-pill-light": options.lightColor,
    "--c2-pill-progress": `${progress}%`,
    "--c2-pill-duration": `${options.duration}ms`,
  } as CSSProperties;

  const hostClass = toast ? "c2-action-pill-host c2-action-pill-host--toast" : "c2-action-pill-host";
  const pillClass = [
    "c2-action-pill",
    ...(toast ? ["c2-action-pill--toast"] : []),
    ...(closing ? ["c2-action-pill-closing"] : []),
  ].join(" ");

  return (
    <div className={hostClass}>
      <button type="button" className={pillClass} style={style} onClick={handleClick}>
        <span className="c2-action-pill-copy">{copy}</span>
        {toast ? null : (
          <span className="c2-action-pill-fill" aria-hidden="true">
            <span className="c2-action-pill-copy c2-action-pill-copy-invert">{copy}</span>
          </span>
        )}
      </button>
    </div>
  );
}
