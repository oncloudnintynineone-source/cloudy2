/**
 * Pure validation/normalization helpers for the roster and departments
 * screens. Kept free of I/O so they can be unit-tested without a database.
 */

export const PHONE_DIGIT_COUNT = 8;

/**
 * Strip non-digits and require exactly 8 digits. Returns the canonical phone
 * (digits only) or null when it does not match.
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== PHONE_DIGIT_COUNT) {
    return null;
  }
  return digits;
}

export type UserRole = "admin" | "user";
export type UserStatus = "active" | "inactive";

export interface UserFormValues {
  name: string;
  phone: string;
  email?: string | null;
  birthday?: string | null;
  role: UserRole;
  status: UserStatus;
  departmentIds: string[];
  primaryDepartmentId: string | null;
}

export interface UserFormErrors {
  name?: string;
  phone?: string;
  email?: string;
  primaryDepartmentId?: string;
  [key: string]: string | undefined;
}

export function validateUserForm(values: UserFormValues): UserFormErrors {
  const errors: UserFormErrors = {};

  if (!values.name.trim()) {
    errors.name = "Name is required";
  }

  if (!normalizePhone(values.phone)) {
    errors.phone = `Phone must be exactly ${PHONE_DIGIT_COUNT} digits`;
  }

  const email = values.email?.trim() ?? "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email or leave it blank";
  }

  if (values.departmentIds.length > 0) {
    if (!values.primaryDepartmentId) {
      errors.primaryDepartmentId = "Select a primary department";
    } else if (!values.departmentIds.includes(values.primaryDepartmentId)) {
      errors.primaryDepartmentId = "Primary must be one of the selected departments";
    }
  }

  return errors;
}

export interface DepartmentFormValues {
  name: string;
  sortOrder: number;
}

export interface DepartmentFormErrors {
  name?: string;
  [key: string]: string | undefined;
}

export function validateDepartmentForm(values: DepartmentFormValues): DepartmentFormErrors {
  const errors: DepartmentFormErrors = {};
  if (!values.name.trim()) {
    errors.name = "Name is required";
  }
  return errors;
}
