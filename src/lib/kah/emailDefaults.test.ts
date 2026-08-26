import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { settings } from "@/db/schema";

import {
  KAH_EMAIL_BODY_TEMPLATE_DEFAULT,
  KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT,
} from "./emailDefaults";

/**
 * The settings row's column defaults must equal the app-code fallback
 * constants: a fresh DB and a missing row must render identical emails.
 */
describe("KAH email template defaults", () => {
  const columns = getTableConfig(settings).columns;
  const defaultOf = (name: string): unknown => {
    const column = columns.find((column) => column.name === name);
    if (!column) {
      throw new Error(`Missing settings column: ${name}`);
    }
    return column.default;
  };

  it("subject column default matches the shared constant", () => {
    expect(defaultOf("kah_email_subject_template")).toBe(KAH_EMAIL_SUBJECT_TEMPLATE_DEFAULT);
  });

  it("body column default matches the shared constant", () => {
    expect(defaultOf("kah_email_body_template")).toBe(KAH_EMAIL_BODY_TEMPLATE_DEFAULT);
  });
});
