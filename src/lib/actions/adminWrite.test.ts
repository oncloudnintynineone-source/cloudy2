import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS } from "@/lib/audit/build";

import { commitAdminWrite, type AdminWriteDeps } from "./adminWrite";

function fakeDeps() {
  const calls: { order: string[]; entries: unknown[] } = { order: [], entries: [] };
  const deps: AdminWriteDeps = {
    log: (async (entry: unknown) => {
      calls.order.push("log");
      calls.entries.push(entry);
    }) as unknown as AdminWriteDeps["log"],
    apply: ((name: string, extra?: unknown) => {
      calls.order.push("apply");
      calls.entries.push({ name, extra });
    }) as unknown as AdminWriteDeps["apply"],
  };
  return { deps, calls };
}

describe("commitAdminWrite", () => {
  it("logs with the session actor, then applies the named effect", async () => {
    const { deps, calls } = fakeDeps();
    await commitAdminWrite(
      {
        session: { user: { id: "11111111-1111-1111-1111-111111111111", name: "Alice", role: "admin" } },
        action: AUDIT_ACTIONS.quickLinkCreate,
        entityType: "quickLink",
        entityId: "link-1",
        entityName: "Leave",
        method: "createQuickLink",
        details: { label: "Leave" },
        effect: "quickLinks",
        extraEffect: { cache: ["settings"] },
      },
      deps,
    );

    expect(calls.order).toEqual(["log", "apply"]);
    expect(calls.entries[0]).toMatchObject({
      actorId: "11111111-1111-1111-1111-111111111111",
      actorName: "Alice",
      actorRole: "admin",
      action: "quickLink.create",
      entityType: "quickLink",
      entityId: "link-1",
      entityName: "Leave",
      method: "createQuickLink",
      details: { label: "Leave" },
    });
    expect(calls.entries[1]).toEqual({
      name: "quickLinks",
      extra: { cache: ["settings"] },
    });
  });

  it("does not apply effects when the audit write throws", async () => {
    const { deps, calls } = fakeDeps();
    deps.log = (async () => {
      throw new Error("audit down");
    }) as unknown as AdminWriteDeps["log"];

    await expect(
      commitAdminWrite(
        {
          session: { user: { id: "admin", name: "Admin", role: "admin" } },
          action: AUDIT_ACTIONS.settingsUpdate,
          entityType: "settings",
          entityId: "singleton",
          entityName: "settings",
          method: "updateKeyword",
          effect: "settings",
        },
        deps,
      ),
    ).rejects.toThrow("audit down");

    expect(calls.order).toEqual([]);
  });
});
