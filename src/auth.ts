import NextAuth from "next-auth";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import DiscordProvider from "next-auth/providers/discord";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { compare } from "bcryptjs";

import { prisma } from "@/lib/prisma";

function parseAdminEmails(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function hasAdminRole(roles: string | null | undefined): boolean {
  if (!roles) return false;
  return roles
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .includes("admin");
}

function addAdminRole(roles: string | null | undefined): string {
  if (!roles) return "admin";
  const parts = roles
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);
  if (parts.some((r) => r.toLowerCase() === "admin")) return roles;
  return [...parts, "admin"].join(",");
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    }),
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.toLowerCase().trim();
        const password = credentials?.password;

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if ((user as typeof user & { mustResetPassword?: boolean })?.mustResetPassword) {
          throw new Error("RESET_REQUIRED");
        }

        if (!user?.passwordHash) return null;

        const ok = await compare(password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.roles = (user as typeof user & { roles?: string | null }).roles ?? null;
        token.member = (user as typeof user & { member?: boolean }).member ?? undefined;

        const currentRoles = (token.roles as string | null | undefined) ?? null;

        const adminEmails = parseAdminEmails(process.env.ADMIN_EMAILS);
        const email = user.email?.toLowerCase() ?? null;

        if (email && adminEmails.has(email) && !hasAdminRole(currentRoles)) {
          const updated = await prisma.user
            .update({
              where: { id: user.id },
              data: { roles: addAdminRole(currentRoles) },
              select: { roles: true },
            })
            .catch(() => null);

          if (updated) token.roles = updated.roles ?? null;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.roles = (token.roles as string | null | undefined) ?? null;
        session.user.member = (token.member as boolean | undefined) ?? undefined;
      }
      return session;
    },
  },
};

export default NextAuth(authOptions);
