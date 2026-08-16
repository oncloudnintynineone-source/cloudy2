import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";

import { getServiceAccountConfig, GOOGLE_CALENDAR_SCOPE } from "./config";
import type { GcalEvent, GoogleCalendarInfo, GoogleIntegration } from "./types";

/**
 * Real Google Calendar integration using a GCP service account (JWT auth).
 * Calendar lifecycle and ACL sharing are implemented — event/Gmail methods are
 * wired in a later phase and currently throw so nothing is silently dropped.
 */
export function createRealGoogleIntegration(): GoogleIntegration {
  let client: calendar_v3.Calendar | null = null;

  function getClient(): calendar_v3.Calendar {
    if (!client) {
      const config = getServiceAccountConfig();
      if (!config) {
        throw new Error("Google Calendar is not configured");
      }
      const auth = new google.auth.JWT({
        email: config.clientEmail,
        key: config.privateKey,
        scopes: [GOOGLE_CALENDAR_SCOPE],
      });
      client = google.calendar({ version: "v3", auth });
    }
    return client;
  }

  function googleStatus(error: unknown): number | undefined {
    return (error as { response?: { status?: number } } | undefined)?.response?.status;
  }

  function fail(error: unknown): never {
    const status = googleStatus(error);
    if (status === 404) {
      throw new Error("Calendar not found in Google Calendar");
    }
    if (status === 401 || status === 403) {
      throw new Error("Google Calendar access denied — check the service account credentials");
    }
    if (status === 429) {
      throw new Error("Google Calendar is rate limited, please try again later");
    }
    throw new Error(
      error instanceof Error ? error.message : "Google Calendar request failed",
    );
  }

  return {
    async createCalendar(name: string) {
      try {
        const res = await getClient().calendars.insert({
          requestBody: { summary: name },
        });
        const calendarId = res.data.id;
        if (!calendarId) {
          throw new Error("Google returned no calendar id");
        }
        return { id: calendarId, calendarId };
      } catch (error) {
        fail(error);
      }
    },

    async renameCalendar(calendarId: string, name: string) {
      try {
        await getClient().calendars.update({
          calendarId,
          requestBody: { summary: name },
        });
      } catch (error) {
        fail(error);
      }
    },

    async deleteCalendar(calendarId: string) {
      try {
        await getClient().calendars.delete({ calendarId });
      } catch (error) {
        if (googleStatus(error) === 404) {
          return;
        }
        fail(error);
      }
    },

    async listCalendars(): Promise<GoogleCalendarInfo[]> {
      try {
        const res = await getClient().calendarList.list({ maxResults: 250 });
        return (res.data.items ?? [])
          .filter((item) => typeof item.id === "string" && typeof item.summary === "string")
          .map((item) => ({ calendarId: item.id!, name: item.summary! }));
      } catch (error) {
        fail(error);
      }
    },

    async getCalendar(calendarId: string): Promise<GoogleCalendarInfo | null> {
      try {
        const res = await getClient().calendars.get({ calendarId });
        if (!res.data.id || !res.data.summary) {
          return null;
        }
        return { calendarId: res.data.id, name: res.data.summary };
      } catch (error) {
        if (googleStatus(error) === 404) {
          return null;
        }
        fail(error);
      }
    },

    async setCalendarAccess(
      calendarId: string,
      email: string,
      role: "reader" | "writer" | "owner" | "freeBusyReader",
    ) {
      try {
        const client = getClient();
        const existing = await findAclRule(client, calendarId, email);
        const requestBody = { role, scope: { type: "user", value: email } };
        if (existing) {
          await client.acl.update({ calendarId, ruleId: existing, requestBody });
        } else {
          await client.acl.insert({ calendarId, requestBody });
        }
      } catch (error) {
        fail(error);
      }
    },

    async listCalendarAccess(calendarId: string): Promise<{ email: string; role: string }[]> {
      try {
        const rules = await listAllAclRules(getClient(), calendarId);
        return rules
          .filter((rule) => rule.scope?.type === "user")
          .map((rule) => ({
            email: rule.scope?.value ?? "",
            role: rule.role ?? "",
          }))
          .filter((rule) => rule.email && rule.role);
      } catch (error) {
        fail(error);
      }
    },

    async removeCalendarAccess(calendarId: string, email: string) {
      try {
        const existing = await findAclRule(getClient(), calendarId, email);
        if (existing) {
          await getClient().acl.delete({ calendarId, ruleId: existing });
        }
      } catch (error) {
        if (googleStatus(error) === 404) {
          return;
        }
        fail(error);
      }
    },

    async createEvent(): Promise<GcalEvent> {
      throw new Error("createEvent is not implemented yet");
    },
    async updateEvent(): Promise<GcalEvent> {
      throw new Error("updateEvent is not implemented yet");
    },
    async deleteEvent(): Promise<void> {
      throw new Error("deleteEvent is not implemented yet");
    },
    async sendEmail(): Promise<void> {
      throw new Error("sendEmail is not implemented yet");
    },
  };
}

async function listAllAclRules(
  client: calendar_v3.Calendar,
  calendarId: string,
): Promise<calendar_v3.Schema$AclRule[]> {
  const rules: calendar_v3.Schema$AclRule[] = [];
  let pageToken: string | undefined;
  do {
    const res = await client.acl.list({ calendarId, pageToken, maxResults: 100 });
    rules.push(...(res.data.items ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return rules;
}

/** Find the ACL rule id for a user email on a calendar, or null. */
async function findAclRule(
  client: calendar_v3.Calendar,
  calendarId: string,
  email: string,
): Promise<string | null> {
  const normalized = email.toLowerCase();
  const rules = await listAllAclRules(client, calendarId);
  const match = rules.find(
    (rule) => rule.scope?.type === "user" && rule.scope.value?.toLowerCase() === normalized,
  );
  return match?.id ?? null;
}
