// lib/prisma.ts
//
// Prisma client singleton. In Next.js dev, module reloads can spawn many
// PrismaClient instances and exhaust the connection pool. We cache the client
// on the global object so a single instance is reused across hot reloads.
//
// Prisma 7 uses a driver adapter (PrismaPg) for the direct DB connection.
// The adapter manages its own pg.Pool, so we also cache it on global to
// avoid creating multiple pools during hot reloads.

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
};

function createClient(): PrismaClient {
  const pool =
    globalForPrisma.pgPool ??
    new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }
  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}