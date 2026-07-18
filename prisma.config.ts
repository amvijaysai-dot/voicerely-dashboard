// prisma.config.ts
//
// Prisma 7 configuration. The datasource connection URL is set here
// (the `url` property is no longer allowed inside schema.prisma when
// `adapter` is passed to the PrismaClient constructor in lib/db.ts)

import { defineConfig } from "@prisma/config";
import { config } from "dotenv";

config({ path: ".env.local" });

export default defineConfig({
  datasource: {
    url: process.env.DIRECT_URL,
  },
  schema: "prisma/schema.prisma",
});