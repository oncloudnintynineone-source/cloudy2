import { compare } from "bcryptjs";
import { and, eq } from "drizzle-orm";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import { db } from "@/db";
import { settings, users } from "@/db/schema";
import { parseUserLogin } from "@/lib/login";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        input: { label: "Password / Phone + keyword", type: "text" },
      },
      async authorize(credentials) {
        const input = credentials?.input;
        if (typeof input !== "string" || !input.trim()) {
          return null;
        }

        const [settingsRow] = await db.select().from(settings).limit(1);
        const userKeyword = settingsRow?.userKeyword ?? "";
        const adminPasswordHash = settingsRow?.adminPasswordHash ?? null;

        // Admin: single input matches the stored admin password hash.
        if (adminPasswordHash) {
          const isAdmin = await compare(input.trim(), adminPasswordHash);
          if (isAdmin) {
            return {
              id: "admin",
              name: "Admin",
              role: "admin" as const,
              phone: null,
            };
          }
        }

        // User: input ends with the keyword; strip it to a canonical phone.
        const phone = parseUserLogin(input, userKeyword);
        if (phone) {
          const [user] = await db
            .select()
            .from(users)
            .where(and(eq(users.phone, phone), eq(users.status, "active")))
            .limit(1);
          if (user) {
            return {
              id: user.id,
              name: user.name,
              role: user.role,
              phone: user.phone,
            };
          }
        }

        return null;
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
