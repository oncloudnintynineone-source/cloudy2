/**
 * Contract for the Google integration layer. Implementations are swapped based
 * on whether real service-account credentials are present, so the app compiles
 * and passes CI without Google credentials (stub) while production wires the
 * real client.
 */

export interface GcalEventInput {
  calendarId: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  attendees?: string[];
}

export interface GcalEvent {
  id: string;
  calendarId: string;
  htmlLink?: string;
}

export interface GoogleIntegration {
  /** Create an event in a Google Calendar. */
  createEvent(input: GcalEventInput): Promise<GcalEvent>;
  /** Update an existing event (full replace). */
  updateEvent(eventId: string, input: GcalEventInput): Promise<GcalEvent>;
  /** Delete an event. */
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  /** Create a new calendar owned by the service account. */
  createCalendar(name: string): Promise<{ id: string; calendarId: string }>;
  /** Rename a calendar. */
  renameCalendar(calendarId: string, name: string): Promise<void>;
  /** Delete a calendar. */
  deleteCalendar(calendarId: string): Promise<void>;
  /** Grant or revoke a user's email read access to a calendar. */
  setCalendarAccess(calendarId: string, email: string, role: "reader" | "writer" | "owner" | "freeBusyReader"): Promise<void>;
  /** Send an email on behalf of the configured delegate account. */
  sendEmail(input: { to: string[]; subject: string; body: string }): Promise<void>;
}
