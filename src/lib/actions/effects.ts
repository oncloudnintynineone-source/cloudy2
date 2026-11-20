/**
 * Named cache-invalidation + revalidation sets for admin writes.
 *
 * Every admin mutation used to spell the same `invalidateConfigCache([...])`
 * and `revalidatePath(...)` tails by hand. Those arrays are load-bearing (a
 * dropped path makes a page stale), so they live here as one reviewed table and
 * a unit test asserts each preset's exact contents.
 */

import { revalidatePath } from "next/cache";

import { invalidateConfigCache, type ConfigCacheKey } from "@/lib/configCache";

export interface WriteEffect {
  /** Config-cache keys to invalidate. */
  cache: readonly ConfigCacheKey[];
  /** Paths to revalidate, in order. */
  revalidate: readonly string[];
}

export const WRITE_EFFECTS = {
  /** Roster create/update: the embedded department name can change. */
  users: {
    cache: ["users"],
    revalidate: ["/settings/users", "/settings/departments"],
  },
  /** Status-only change: no department data moves. */
  userStatus: {
    cache: ["users"],
    revalidate: ["/settings/users"],
  },
  /** Department create/rename/delete: users embed the department name. */
  departments: {
    cache: ["calendars", "users"],
    revalidate: ["/settings/departments", "/settings/users", "/dashboard", "/parade-state"],
  },
  /** Sibling move / whole-tree reorder: only the department order changes. */
  departmentOrder: {
    cache: ["calendars"],
    revalidate: ["/settings/departments", "/dashboard", "/parade-state"],
  },
  eventTypes: {
    cache: ["eventTypes"],
    revalidate: ["/settings/event-types"],
  },
  eventTypeGroups: {
    cache: ["eventTypeGroups"],
    revalidate: ["/settings/event-types"],
  },
  templates: {
    cache: ["eventTitleTemplates"],
    revalidate: ["/settings/templates", "/dashboard", "/parade-state"],
  },
  quickLinks: {
    cache: ["quickLinks"],
    revalidate: ["/settings/quick-links", "/dashboard"],
  },
  webhooks: {
    cache: [],
    revalidate: ["/settings/webhooks"],
  },
  kahGroups: {
    cache: [],
    revalidate: ["/settings/kah-groups"],
  },
  /** Singleton settings edits supply their own paths via `editSetting`. */
  settings: {
    cache: ["settings"],
    revalidate: [],
  },
} as const satisfies Record<string, WriteEffect>;

export type WriteEffectName = keyof typeof WRITE_EFFECTS;

function mergeUnique<T>(first: readonly T[], second: readonly T[] | undefined): T[] {
  const out: T[] = [];
  for (const value of [...first, ...(second ?? [])]) {
    if (!out.includes(value)) {
      out.push(value);
    }
  }
  return out;
}

/** The merged effect for `name` plus a one-off extra, deduped in call order. */
export function resolveWriteEffect(
  name: WriteEffectName,
  extra?: Partial<WriteEffect>,
): WriteEffect {
  const base = WRITE_EFFECTS[name];
  return {
    cache: mergeUnique(base.cache, extra?.cache),
    revalidate: mergeUnique(base.revalidate, extra?.revalidate),
  };
}

/**
 * Invalidate the config cache first, then revalidate every path — the order
 * every existing admin tail used (the config cache is read during the revalidated
 * render, so it must be dropped first).
 */
export function applyWriteEffects(name: WriteEffectName, extra?: Partial<WriteEffect>): void {
  const effect = resolveWriteEffect(name, extra);
  if (effect.cache.length > 0) {
    invalidateConfigCache(effect.cache);
  }
  for (const path of effect.revalidate) {
    revalidatePath(path);
  }
}
