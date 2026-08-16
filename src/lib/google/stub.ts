import type { GoogleIntegration } from "./types";

/**
 * No-op implementation used before Google credentials are provisioned. Every
 * operation resolves successfully but performs no external side effects, so
 * the app runs and tests pass without a GCP service account.
 */
export const stubGoogleIntegration: GoogleIntegration = {
  async createEvent() {
    return { id: "stub", calendarId: "stub" };
  },
  async updateEvent() {
    return { id: "stub", calendarId: "stub" };
  },
  async deleteEvent() {},
  async createCalendar() {
    return { id: "stub", calendarId: "stub" };
  },
  async renameCalendar() {},
  async deleteCalendar() {},
  async setCalendarAccess() {},
  async sendEmail() {},
};
