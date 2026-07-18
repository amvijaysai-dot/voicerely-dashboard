// prisma.config.ts
//
// Prisma 7 configuration. The datasource connection URL is supplied here
// (the `url` property is no longer allowed inside schema.prisma). The
// `adapter` is passed to the PrismaClient constructor in lib/prisma.ts.

import { defineConfig } from "@prisma/config";

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL,
  },
  schema: "prisma/schema.prisma",
});