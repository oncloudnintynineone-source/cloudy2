import type { GoogleIntegration } from "./types";

/**
 * No-op implementation used when no Google service-account credentials are
 * present. Every operation resolves successfully but performs no external side
 * effects, so the app runs and tests pass without a GCP service account.
 */
export const stubGoogleIntegration: GoogleIntegration = {
  async createEvent() {
    return { id: "stub", calendarId: "stub" };
  },
  async updateEvent() {
    return { id: "stub", calendarId: "stub" };
  },
  async deleteEvent() {},
  async listEvents() {
    return [];
  },
  async createCalendar() {
    return { id: "stub", calendarId: "stub" };
  },
  async renameCalendar() {},
  async deleteCalendar() {},
  async listCalendars() {
    return [];
  },
  async getCalendar() {
    return null;
  },
  async setCalendarAccess() {},
  async listCalendarAccess() {
    return [];
  },
  async removeCalendarAccess() {},
  async sendEmail() {},
};
