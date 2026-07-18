-- prisma/migrations/ADD_billing_cycle.sql
--
-- Additive migration: introduces the billing-cycle window on Tenant.
-- Safe to run against an EXISTING database that already has the
-- Tenant / CallLog / RetellApiKey / AuditLog / Session tables
-- (i.e. the schema from the prior baseline). If you are creating the
-- database from scratch, use `prisma migrate dev` with the full schema
-- instead — this file only adds the two new columns.
--
-- Run with:  psql "$DATABASE_URL" -f prisma/migrations/ADD_billing_cycle.sql

ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "billingCycleStart" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "billingCycleEnd"   TIMESTAMP(3);

-- Backfill existing tenants: derive the cycle from their signup
-- anniversary (day-of-month of "createdAt") and zero the in-cycle
-- usedMinutes for the new current cycle.
--
-- This mirrors lib/billing/cycle.ts currentCycle(): window runs from
-- the anniversary day to the day before that day next month.
UPDATE "Tenant"
SET
  "billingCycleStart" = (
    date_trunc('month', now() AT TIME ZONE 'UTC')
      + (EXTRACT(DAY FROM "createdAt")::int - 1) * INTERVAL '1 day'
  ),
  "billingCycleEnd" = (
    date_trunc('month', now() AT TIME ZONE 'UTC')
      + (EXTRACT(DAY FROM "createdAt")::int - 1) * INTERVAL '1 day'
      + INTERVAL '1 month'
  ),
  "usedMinutes" = 0
WHERE "isAdmin" = false
  AND ("billingCycleStart" IS NULL OR "billingCycleEnd" IS NULL);
