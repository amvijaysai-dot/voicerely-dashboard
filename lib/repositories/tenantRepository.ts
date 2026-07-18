// lib/repositories/tenantRepository.ts
//
// Driver dispatcher for the tenant repository. Re-exports the active data
// driver so the rest of the app imports a single stable interface:
//
//   import { createTenant } from "@/lib/repositories/tenantRepository";
//
// Switch the backend by setting DATA_DRIVER in the environment:
//   - "json"     (default) -> tenantJsonRepository.ts   (flat-file, dev)
//   - "postgres"          -> tenantPostgresRepository.ts (Prisma + Postgres)
//
// Both drivers expose the IDENTICAL async interface, so flipping the flag
// requires no changes anywhere else in the codebase.

import * as jsonDriver from "./tenantJsonRepository";
import * as postgresDriver from "./tenantPostgresRepository";

const driver = process.env.DATA_DRIVER === "postgres" ? postgresDriver : jsonDriver;

export const listTenants = driver.listTenants;
export const listClientTenants = driver.listClientTenants;
export const getTenantById = driver.getTenantById;
export const getTenantByUsername = driver.getTenantByUsername;
export const getTenantByEmail = driver.getTenantByEmail;
export const createTenant = driver.createTenant;
export const updateTenant = driver.updateTenant;
export const updateTenantPassword = driver.updateTenantPassword;
export const deleteTenant = driver.deleteTenant;
export const getTenantByAgentId = driver.getTenantByAgentId;
export const appendCallLog = driver.appendCallLog;
export const incrementUsedMinutes = driver.incrementUsedMinutes;
export const listCallLogs = driver.listCallLogs;
