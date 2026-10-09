import { describe, expect, it } from "vitest";

import type { PreparedSettingEdit, SettingsCacheKey, SettingsRow } from "./edits";
import { editSetting, type SettingsEditDeps } from "./write";

type LogEntry = Parameters<SettingsEditDeps["log"]>[0];

function fakeDeps(overrides: Partial<SettingsEditDeps> = {}) {
  const before = { userKeyword: "leave" } as unknown as SettingsRow;
  const calls = {
    update: [] as Partial<SettingsRow>[],
    log: [] as LogEntry[],
    invalidate: [] as (readonly SettingsCacheKey[])[],
    revalidate: [] as string[],
  };
  const deps: SettingsEditDeps = {
    requireAdmin: (async () => ({
      user: { id: "admin", name: "Admin", role: "admin" },
    })) as unknown as SettingsEditDeps["requireAdmin"],
    read: async () => before,
    update: async (patch) => {
      calls.update.push(patch);
    },
    log: (async (entry: LogEntry) => {
      calls.log.push(entry);
    }) as unknown as SettingsEditDeps["log"],
    invalidate: (keys) => {
      calls.invalidate.push(keys);
    },
    revalidate: (path) => {
      calls.revalidate.push(path);
    },
    ...overrides,
  };
  return { deps, calls, before };
}

const prepared: PreparedSettingEdit = {
  patch: { userKeyword: "ops" },
  auditBefore: { userKeyword: "leave" },
  auditAfter: { userKeyword: "ops" },
  revalidate: ["/settings/security"],
};

describe("editSetting", () => {
  it("requires admin, applies the patch, audits the diff, and revalidates", async () => {
    const { deps, calls, before } = fakeDeps();
    let seen: SettingsRow | undefined;
    const result = await editSetting(
      "updateKeyword",
      (row) => {
        seen = row;
        return { ok: true, prepared };
      },
      deps,
    );

    expect(result).toEqual({ ok: true });
    expect(seen).toBe(before);
    expect(calls.update).toEqual([{ userKeyword: "ops" }]);
    expect(calls.log).toHaveLength(1);
    expect(calls.log[0]).toMatchObject({
      action: "settings.update",
      entityType: "settings",
      entityName: "settings",
      method: "updateKeyword",
    });
    expect(calls.log[0].details).toEqual({
      before: { userKeyword: "leave" },
      after: { userKeyword: "ops" },
      changes: { userKeyword: ["leave", "ops"] },
    });
    // No cacheKeys on the edit -> defaults to the settings key.
    expect(calls.invalidate).toEqual([["settings"]]);
    expect(calls.revalidate).toEqual(["/settings/security"]);
  });

  it("honours explicit cache keys and revalidates every path", async () => {
    const { deps, calls } = fakeDeps();
    await editSetting(
      "updateEventTitleRecipe",
      () => ({
        ok: true,
        prepared: {
          ...prepared,
          cacheKeys: ["settings", "eventTitleTemplates"],
          revalidate: ["/settings/templates", "/dashboard"],
        },
      }),
      deps,
    );
    expect(calls.invalidate).toEqual([["settings", "eventTitleTemplates"]]);
    expect(calls.revalidate).toEqual(["/settings/templates", "/dashboard"]);
  });

  it("awaits an async prepare (edits that read extra state)", async () => {
    const { deps, calls } = fakeDeps();
    const result = await editSetting("updateX", async () => ({ ok: true, prepared }), deps);
    expect(result).toEqual({ ok: true });
    expect(calls.update).toHaveLength(1);
  });

  it("returns the field error and writes nothing when the prepare fails", async () => {
    const { deps, calls } = fakeDeps();
    const result = await editSetting(
      "updateKeyword",
      () => ({ ok: false, error: "Keyword must be 1–12 letters", field: "keyword" }),
      deps,
    );
    expect(result).toEqual({ ok: false, error: "Keyword must be 1–12 letters", field: "keyword" });
    expect(calls.update).toEqual([]);
    expect(calls.log).toEqual([]);
    expect(calls.invalidate).toEqual([]);
    expect(calls.revalidate).toEqual([]);
  });

  it("stops before reading or preparing when auth fails", async () => {
    const read = async () => {
      throw new Error("should not read");
    };
    const { deps } = fakeDeps({
      requireAdmin: (async () => {
        throw new Error("auth redirect");
      }) as unknown as SettingsEditDeps["requireAdmin"],
      read,
    });
    await expect(
      editSetting("updateKeyword", () => ({ ok: true, prepared }), deps),
    ).rejects.toThrow("auth redirect");
  });
});
