import { PrismaClient } from "@prisma/client";

if (
  process.env.NODE_ENV === "production" &&
  !process.env.DATABASE_URL &&
  process.env.NETLIFY_DATABASE_URL
) {
  process.env.DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
}

declare global {
  var prisma: PrismaClient | undefined;
}

export const prisma = global.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") global.prisma = prisma;
