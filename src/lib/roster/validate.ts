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
  shortname: string;
  phone: string;
  email?: string | null;
  birthday?: string | null;
  role: UserRole;
  status: UserStatus;
  departmentId: string | null;
}

export interface UserFormErrors {
  name?: string;
  shortname?: string;
  phone?: string;
  email?: string;
  [key: string]: string | undefined;
}

export function validateUserForm(values: UserFormValues): UserFormErrors {
  const errors: UserFormErrors = {};

  if (!values.name.trim()) {
    errors.name = "Name is required";
  }

  if (!values.shortname?.trim()) {
    errors.shortname = "Shortname is required";
  }

  if (!normalizePhone(values.phone)) {
    errors.phone = `Phone must be exactly ${PHONE_DIGIT_COUNT} digits`;
  }

  const email = values.email?.trim() ?? "";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email or leave it blank";
  }

  return errors;
}

export interface CalendarFormValues {
  name: string;
}

export interface CalendarFormErrors {
  name?: string;
  [key: string]: string | undefined;
}

export function validateCalendarForm(values: CalendarFormValues): CalendarFormErrors {
  const errors: CalendarFormErrors = {};
  if (!values.name.trim()) {
    errors.name = "Name is required";
  }
  return errors;
}
