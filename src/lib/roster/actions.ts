"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { departments, userDepartments, users } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import {
  normalizePhone,
  validateDepartmentForm,
  validateUserForm,
  type DepartmentFormValues,
  type UserFormValues,
  type UserStatus,
} from "@/lib/roster/validate";

export type RosterActionResult =
  | { ok: true }
  | { ok: false; error: string; field?: "phone" | "name" };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}

async function syncDepartments(
  userId: string,
  departmentIds: string[],
  primaryDepartmentId: string | null,
): Promise<void> {
  if (departmentIds.length === 0) {
    await db.delete(userDepartments).where(eq(userDepartments.userId, userId));
    return;
  }

  const primary =
    primaryDepartmentId && departmentIds.includes(primaryDepartmentId)
      ? primaryDepartmentId
      : departmentIds[0];

  await db.transaction(async (tx) => {
    await tx.delete(userDepartments).where(eq(userDepartments.userId, userId));
    await tx.insert(userDepartments).values(
      departmentIds.map((departmentId) => ({
        userId,
        departmentId,
        isPrimary: departmentId === primary,
      })),
    );
  });
}

export async function createUser(input: UserFormValues): Promise<RosterActionResult> {
  await requireAdmin();

  const errors = validateUserForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Check the highlighted fields", field: "phone" };
  }

  const phone = normalizePhone(input.phone)!;
  try {
    const [created] = await db
      .insert(users)
      .values({
        name: input.name.trim(),
        phone,
        email: input.email?.trim() || null,
        birthday: input.birthday || null,
        role: input.role,
        status: input.status,
      })
      .returning({ id: users.id });
    await syncDepartments(created.id, input.departmentIds, input.primaryDepartmentId);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "A user with this phone number already exists", field: "phone" };
    }
    throw error;
  }

  revalidatePath("/roster");
  return { ok: true };
}

export async function updateUser(
  id: string,
  input: UserFormValues,
): Promise<RosterActionResult> {
  await requireAdmin();

  const errors = validateUserForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Check the highlighted fields", field: "phone" };
  }

  const phone = normalizePhone(input.phone)!;
  try {
    await db
      .update(users)
      .set({
        name: input.name.trim(),
        phone,
        email: input.email?.trim() || null,
        birthday: input.birthday || null,
        role: input.role,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id));
    await syncDepartments(id, input.departmentIds, input.primaryDepartmentId);
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "A user with this phone number already exists", field: "phone" };
    }
    throw error;
  }

  revalidatePath("/roster");
  return { ok: true };
}

export async function setUserStatus(
  id: string,
  status: UserStatus,
): Promise<RosterActionResult> {
  await requireAdmin();
  await db
    .update(users)
    .set({ status, updatedAt: new Date() })
    .where(eq(users.id, id));
  revalidatePath("/roster");
  return { ok: true };
}

export async function createDepartment(
  input: DepartmentFormValues,
): Promise<RosterActionResult> {
  await requireAdmin();

  const errors = validateDepartmentForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Name is required", field: "name" };
  }

  try {
    await db.insert(departments).values({ name: input.name.trim(), sortOrder: input.sortOrder });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "A department with this name already exists", field: "name" };
    }
    throw error;
  }

  revalidatePath("/departments");
  revalidatePath("/roster");
  return { ok: true };
}

export async function updateDepartment(
  id: string,
  input: DepartmentFormValues,
): Promise<RosterActionResult> {
  await requireAdmin();

  const errors = validateDepartmentForm(input);
  if (Object.keys(errors).length > 0) {
    return { ok: false, error: "Name is required", field: "name" };
  }

  try {
    await db
      .update(departments)
      .set({ name: input.name.trim(), sortOrder: input.sortOrder, updatedAt: new Date() })
      .where(eq(departments.id, id));
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: "A department with this name already exists", field: "name" };
    }
    throw error;
  }

  revalidatePath("/departments");
  revalidatePath("/roster");
  return { ok: true };
}

export async function deleteDepartment(id: string): Promise<RosterActionResult> {
  await requireAdmin();
  await db.delete(departments).where(eq(departments.id, id));
  revalidatePath("/departments");
  revalidatePath("/roster");
  return { ok: true };
}
