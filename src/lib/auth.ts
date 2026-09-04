import { compare } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { AUDIT_ACTIONS, actorFromUser } from "@/lib/audit/build";
import { logAction } from "@/lib/audit/log";
import { ensureAdminSecrets } from "@/lib/bootstrap";
import { normalizePhoneDigits, parseUserLogin } from "@/lib/login";

/**
 * Single Credentials provider behind two explicit login surfaces (see
 * `src/components/LoginForm.tsx`):
 * - `mode: "staff"`  — a regular user: `[phone]<keyword>` in one input.
 *   Only `role='user'` accounts are accepted; an admin-role user must use the
 *   admin surface, so the org-wide keyword can never yield an admin session.
 * - `mode: "admin"`  — a named admin (`phone` + shared admin PIN) or the
 *   phone-less break-glass root (`secret` matched against
 *   `admin_password_hash`, phone left blank).
 *
 * `authorize` is the only place a session is issued and the only place login
 * failures are audit-logged (distinct reasons — never the raw secrets).
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        mode: { label: "Mode", type: "text" },
        input: { label: "Phone + keyword", type: "text" },
        phone: { label: "Phone", type: "text" },
        secret: { label: "PIN / password", type: "password" },
      },
      async authorize(credentials) {
        const mode = credentials?.mode;
        if (mode !== "admin" && mode !== "staff") {
          return null;
        }

        // Seed/reconcile the admin secrets from env before reading them.
        await ensureAdminSecrets();
        const [settingsRow] = await db.select().from(settings).limit(1);
        const userKeyword = settingsRow?.userKeyword ?? "";

        if (mode === "staff") {
          const input = credentials?.input;
          if (typeof input !== "string" || !input.trim()) {
            await logAdminLoginFailure(null, "unknown_input", "credentials.authorize");
            return null;
          }

          const phone = parseUserLogin(input, userKeyword);
          const [user] = phone
            ? await db
                .select()
                .from(users)
                .where(and(eq(users.phone, phone), eq(users.status, "active")))
                .limit(1)
            : [];
          // Admins never authenticate through the shared keyword: deny the
          // match (generic failure) so the staff surface stays least-privilege.
          if (!user || user.role !== "user") {
            await logAdminLoginFailure(
              phone,
              phone ? "invalid_credentials" : "unknown_input",
              "credentials.authorize",
            );
            return null;
          }

          await logAuthSuccess(
            { id: user.id, name: user.name, role: user.role, phone: user.phone },
            "credentials.authorize",
          );
          return { id: user.id, name: user.name, role: user.role, phone: user.phone };
        }

        // mode === "admin"
        const secret = credentials?.secret;
        if (typeof secret !== "string" || !secret.trim()) {
          await logAdminLoginFailure(null, "unknown_input", "credentials.authorize");
          return null;
        }
        const rawPhone = credentials?.phone;
        const phone =
          typeof rawPhone === "string" && rawPhone.trim() ? normalizePhoneDigits(rawPhone) : null;

        // Break-glass root: a phone-less secret matched against the root hash.
        if (!phone) {
          const adminPasswordHash = settingsRow?.adminPasswordHash ?? null;
          const isRoot = adminPasswordHash
            ? await compare(secret.trim(), adminPasswordHash)
            : false;
          if (isRoot) {
            await logAuthSuccess(
              { id: "admin", name: "Admin", role: "admin", phone: null },
              "credentials.authorize",
            );
            return { id: "admin", name: "Admin", role: "admin", phone: null };
          }
          await logAdminLoginFailure(null, "admin.invalid_root_secret", "credentials.authorize");
          return null;
        }

        // Named admin: an active admin-role user's phone + the shared admin PIN.
        const [admin] = phone
          ? await db
              .select()
              .from(users)
              .where(and(eq(users.phone, phone), eq(users.status, "active")))
              .limit(1)
          : [];
        if (!admin || admin.role !== "admin") {
          await logAdminLoginFailure(phone, "admin.invalid_account", "credentials.authorize");
          return null;
        }
        const adminPinHash = settingsRow?.adminPinHash ?? null;
        const pinMatches = adminPinHash ? await compare(secret.trim(), adminPinHash) : false;
        if (!pinMatches) {
          await logAdminLoginFailure(phone, "admin.invalid_pin", "credentials.authorize");
          return null;
        }

        await logAuthSuccess(
          { id: admin.id, name: admin.name, role: admin.role, phone: admin.phone },
          "credentials.authorize",
        );
        return { id: admin.id, name: admin.name, role: admin.role, phone: admin.phone };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.phone = user.phone;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as "admin" | "user";
        session.user.phone = (token.phone as string | null) ?? null;
      }
      return session;
    },
  },
};

async function logAuthSuccess(
  actor: { id: string; name: string | null; role: "admin" | "user"; phone: string | null },
  method: string,
) {
  await logAction({
    ...actorFromUser({ id: actor.id, name: actor.name, role: actor.role }),
    action: AUDIT_ACTIONS.authLoginSuccess,
    method,
  });
}

/**
 * Failure: record the derived phone (never the raw input, which could be a
 * secret) plus a stable reason, so the trail captures attempts without
 * leaking credentials.
 */
async function logAdminLoginFailure(phone: string | null, reason: string, method: string) {
  await logAction({
    actorId: null,
    actorName: phone ?? null,
    actorRole: null,
    action: AUDIT_ACTIONS.authLoginFailure,
    method,
    details: { reason },
  });
}
