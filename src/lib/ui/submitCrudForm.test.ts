import { describe, expect, it } from "vitest";
import type { UseFormReturnType } from "@mantine/form";

import { submitCrudForm, type CrudNotification } from "./submitCrudForm";

interface Values {
  name: string;
}

function fakeForm() {
  const errors: Record<string, string> = {};
  const form = {
    setFieldError: (field: string, error: string) => {
      errors[field] = error;
    },
  } as unknown as UseFormReturnType<Values>;
  return { form, errors };
}

const success = { create: "Created", update: "Updated" };

describe("submitCrudForm", () => {
  it("toasts the create copy and hands the success arm to onSuccess", async () => {
    const notes: CrudNotification[] = [];
    const { form } = fakeForm();
    let seen: unknown;
    const submit = submitCrudForm({
      form,
      isEdit: false,
      create: async () => ({ ok: true, id: "1" }),
      update: async () => ({ ok: true, id: "1" }),
      success,
      notify: (n) => notes.push(n),
      onSuccess: (result) => {
        seen = result;
      },
    });
    await submit({ name: "A" });
    expect(notes).toEqual([{ color: "green", message: "Created" }]);
    expect(seen).toEqual({ ok: true, id: "1" });
  });

  it("toasts the update copy in edit mode", async () => {
    const notes: CrudNotification[] = [];
    const { form } = fakeForm();
    const submit = submitCrudForm({
      form,
      isEdit: true,
      create: async () => ({ ok: true }),
      update: async () => ({ ok: true }),
      success,
      notify: (n) => notes.push(n),
    });
    await submit({ name: "A" });
    expect(notes).toEqual([{ color: "green", message: "Updated" }]);
  });

  it("maps the returned field error onto the mapped form field", async () => {
    const notes: CrudNotification[] = [];
    const { form, errors } = fakeForm();
    const submit = submitCrudForm<Values, "label">({
      form,
      isEdit: false,
      create: async () => ({ ok: false, error: "Bad", field: "label" }),
      update: async () => ({ ok: true }),
      success,
      fieldMap: { label: "name" },
      notify: (n) => notes.push(n),
    });
    await submit({ name: "A" });
    expect(errors).toEqual({ name: "Bad" });
    expect(notes).toEqual([{ color: "red", message: "Bad" }]);
  });

  it("toasts warnings in yellow with the success title", async () => {
    const notes: CrudNotification[] = [];
    const { form } = fakeForm();
    const submit = submitCrudForm({
      form,
      isEdit: false,
      create: async () => ({ ok: true, warnings: ["One", "Two"] }),
      update: async () => ({ ok: true, warnings: [] as string[] }),
      success,
      warnings: true,
      notify: (n) => notes.push(n),
    });
    await submit({ name: "A" });
    expect(notes).toEqual([{ color: "yellow", title: "Created", message: "One · Two" }]);
  });
});
