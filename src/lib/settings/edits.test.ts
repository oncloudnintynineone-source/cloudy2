import { describe, expect, it } from "vitest";

import {
  prepareAssignmentsEdit,
  prepareBannerEdit,
  prepareEventTitleRecipeEdit,
  prepareFeatureFlagsEdit,
  prepareKahNotificationsEdit,
  prepareKeywordEdit,
  prepareNameTemplateEdit,
  prepareRetentionEdit,
  type SettingsRow,
} from "./edits";
import { FEATURE_FLAGS } from "./featureFlags";
import { DEFAULT_TITLE_RECIPE } from "./titleRecipe";

function row(over: Partial<SettingsRow> = {}): SettingsRow {
  return {
    userKeyword: "leave",
    nameTemplate: "{name}",
    eventTitleRecipe: DEFAULT_TITLE_RECIPE,
    eventTitleTemplateAssignments: {},
    auditLogRetentionDays: 90,
    bannerEnabled: false,
    bannerText: "",
    bannerColor: null,
    kahEmailSubjectTemplate: "subj",
    kahEmailBodyTemplate: "body {breaches}",
    ...over,
  } as unknown as SettingsRow;
}

describe("prepareKeywordEdit", () => {
  it("lowercases the keyword and audits the before/after", () => {
    const outcome = prepareKeywordEdit(row({ userKeyword: "leave" }), " Ops ");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.prepared.patch).toEqual({ userKeyword: "ops" });
    expect(outcome.prepared.auditBefore).toEqual({ userKeyword: "leave" });
    expect(outcome.prepared.auditAfter).toEqual({ userKeyword: "ops" });
    expect(outcome.prepared.revalidate).toEqual(["/settings/security"]);
    expect(outcome.prepared.cacheKeys).toBeUndefined();
  });

  it("rejects a blank or non-letter keyword", () => {
    expect(prepareKeywordEdit(undefined, "")).toEqual({
      ok: false,
      error: "Keyword must be 1–12 letters",
      field: "keyword",
    });
    expect(prepareKeywordEdit(undefined, "abc123")).toMatchObject({ ok: false, field: "keyword" });
  });
});

describe("prepareNameTemplateEdit", () => {
  it("trims and patches the template", () => {
    const outcome = prepareNameTemplateEdit(row(), "  {name} · {department} ");
    expect(outcome).toMatchObject({
      ok: true,
      prepared: {
        patch: { nameTemplate: "{name} · {department}" },
        revalidate: ["/settings/templates"],
      },
    });
  });

  it("rejects blank and multi-line templates", () => {
    expect(prepareNameTemplateEdit(row(), "")).toMatchObject({
      ok: false,
      field: "nameTemplate",
    });
    expect(prepareNameTemplateEdit(row(), "a\nb")).toMatchObject({
      ok: false,
      field: "nameTemplate",
    });
  });
});

describe("prepareEventTitleRecipeEdit", () => {
  it("sanitizes the recipe and the stored before value", () => {
    const before = row({ eventTitleRecipe: { segments: [{ field: "type" }] } as never });
    const outcome = prepareEventTitleRecipeEdit(before, {
      segments: [{ field: "description" }],
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.prepared.patch.eventTitleRecipe).toEqual({
      segments: [{ field: "description" }],
    });
    expect(outcome.prepared.auditBefore).toEqual({
      eventTitleRecipe: { segments: [{ field: "type" }] },
    });
    expect(outcome.prepared.revalidate).toEqual(["/settings/templates", "/dashboard"]);
  });

  it("rejects an empty recipe", () => {
    expect(prepareEventTitleRecipeEdit(row(), { segments: [] })).toMatchObject({
      ok: false,
      field: "recipe",
    });
  });
});

describe("prepareAssignmentsEdit", () => {
  const known = new Set(["t1", "t2"]);

  it("drops empty entries and stores only known targets", () => {
    const outcome = prepareAssignmentsEdit(
      row({ eventTitleTemplateAssignments: { month: "t1" } as never }),
      { month: "t2", week: null, agenda: "" },
      known,
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.prepared.patch).toEqual({ eventTitleTemplateAssignments: { month: "t2" } });
    expect(outcome.prepared.auditBefore).toEqual({ assignments: { month: "t1" } });
    expect(outcome.prepared.auditAfter).toEqual({ assignments: { month: "t2" } });
  });

  it("rejects an unknown template id", () => {
    expect(prepareAssignmentsEdit(row(), { month: "missing" }, known)).toMatchObject({
      ok: false,
      field: "assignments",
      error: "Unknown template",
    });
  });
});

describe("prepareRetentionEdit", () => {
  it("patches a valid retention value", () => {
    const outcome = prepareRetentionEdit(row({ auditLogRetentionDays: 90 }), 30);
    expect(outcome).toMatchObject({
      ok: true,
      prepared: {
        patch: { auditLogRetentionDays: 30 },
        auditBefore: { auditLogRetentionDays: 90 },
        revalidate: ["/settings/general"],
      },
    });
  });

  it("rejects out-of-range values", () => {
    expect(prepareRetentionEdit(row(), 6)).toMatchObject({ ok: false, field: "retentionDays" });
    expect(prepareRetentionEdit(row(), 366)).toMatchObject({ ok: false, field: "retentionDays" });
    expect(prepareRetentionEdit(row(), Number.NaN)).toMatchObject({
      ok: false,
      field: "retentionDays",
    });
  });
});

describe("prepareBannerEdit", () => {
  it("patches enabled text and normalizes the color", () => {
    const outcome = prepareBannerEdit(row({ bannerEnabled: false, bannerText: "" }), {
      enabled: true,
      text: "  Maintenance  ",
      color: "green",
    });
    expect(outcome).toMatchObject({
      ok: true,
      prepared: {
        patch: { bannerEnabled: true, bannerText: "Maintenance", bannerColor: "green" },
        revalidate: ["/settings/banner"],
      },
    });
  });

  it("requires text only while the banner is enabled", () => {
    expect(prepareBannerEdit(row(), { enabled: true, text: "", color: "brand" })).toMatchObject({
      ok: false,
      field: "bannerText",
    });
    expect(prepareBannerEdit(row(), { enabled: false, text: "", color: "brand" })).toMatchObject({
      ok: true,
    });
  });
});

describe("prepareFeatureFlagsEdit", () => {
  const def = FEATURE_FLAGS[0];

  it("patches only the submitted flag, auditing the merged set", () => {
    const outcome = prepareFeatureFlagsEdit(row(), { [def.key]: def.defaultValue });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.prepared.patch).toEqual({ [def.key]: def.defaultValue });
    expect(outcome.prepared.auditAfter).toMatchObject({ [def.key]: def.defaultValue });
    expect(outcome.prepared.revalidate).toEqual(["/settings/feature-flags"]);
  });

  it("rejects an empty payload", () => {
    expect(prepareFeatureFlagsEdit(row(), {})).toMatchObject({
      ok: false,
      field: "featureFlags",
      error: "No feature flags to update",
    });
  });

  it("rejects an out-of-set value with the labeled message", () => {
    expect(prepareFeatureFlagsEdit(row(), { [def.key]: "not-an-option" })).toEqual({
      ok: false,
      error: `${def.label}: choose one of the available options`,
      field: "featureFlags",
    });
  });
});

describe("prepareKahNotificationsEdit", () => {
  it("trims and patches the subject and body", () => {
    const outcome = prepareKahNotificationsEdit(row(), {
      subjectTemplate: "  Hi  ",
      bodyTemplate: "  {breaches}  ",
    });
    expect(outcome).toMatchObject({
      ok: true,
      prepared: {
        patch: { kahEmailSubjectTemplate: "Hi", kahEmailBodyTemplate: "{breaches}" },
        revalidate: ["/settings/general", "/settings/kah-groups"],
      },
    });
  });

  it("requires a subject and the {breaches} token", () => {
    expect(
      prepareKahNotificationsEdit(row(), { subjectTemplate: "", bodyTemplate: "{breaches}" }),
    ).toMatchObject({ ok: false, field: "kahSubject" });
    expect(
      prepareKahNotificationsEdit(row(), { subjectTemplate: "s", bodyTemplate: "no token" }),
    ).toMatchObject({ ok: false, field: "kahBody" });
  });
});
