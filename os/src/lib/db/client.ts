import { PrismaClient } from "@prisma/client";

// Scripts and tests started without os/.env still find the local database.
process.env.DATABASE_URL ??= "file:./dev.db";

// Standard Next.js dev-mode pattern: hot-reload re-executes this module on
// every edit, which would otherwise open a fresh SQLite connection each
// time. Stash the client on globalThis so it survives reloads.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
