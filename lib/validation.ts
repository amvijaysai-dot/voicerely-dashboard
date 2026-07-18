// lib/validation.ts
//
// Zod schemas for incoming request payloads + a clean error envelope helper.
// Routes use these so endpoint failures emit structured JSON with proper
// HTTP status codes instead of leaking raw internal error messages.

import { z } from "zod";
import { RetellApiError } from "@/lib/errors";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const onboardTenantSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required"),
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(64, "Username too long")
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username has invalid characters"),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  // Billing model selection
  billingModel: z.enum(["hybrid", "metered_maintenance", "pure_per_minute"]).optional().default("hybrid"),
  // Hybrid model fields
  baseMonthlyFee: z.coerce.number().min(0, "Base monthly fee must be >= 0").optional().default(0),
  includedMinutes: z.coerce.number().int().min(0, "Included minutes must be >= 0").optional().default(0),
  // Per-minute rate (used by all models)
  perMinuteRate: z.coerce.number().min(0, "Per-minute rate must be >= 0").optional().default(0.18),
  // Legacy field for backward compatibility
  allowedMinutes: z.coerce.number().int().min(0, "Allowed minutes must be >= 0").optional().default(0),
  retellApiKey: z.string().optional().default(""),
  // Primary Retell agent tracking id (stored as agentIds[0] on the tenant).
  agentId: z.string().trim().optional().default(""),
  // Client contact email address (used for onboarding + notifications).
  email: z
    .string()
    .trim()
    .email("Enter a valid email address")
    .optional()
    .default(""),
});

export const setPasswordSchema = z.object({
  tenantId: z.string().trim().min(1, "Missing tenant"),
  token: z.string().trim().min(1, "Missing token"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

// Partial update for an existing tenant. All fields optional; retellApiKey is
// only re-encrypted when a non-empty value is supplied. status toggles
// active/suspended. Password rotation is intentionally out of scope here.
export const updateTenantSchema = z
  .object({
    clientName: z.string().trim().min(1, "Client name is required").optional(),
    allowedMinutes: z.coerce.number().int().min(0, "Allowed minutes must be >= 0").optional(),
    perMinuteRate: z.coerce.number().min(0, "Per-minute rate must be >= 0").optional(),
    status: z.enum(["active", "suspended"]).optional(),
    retellApiKey: z.string().min(1).optional(),
    // Primary Retell agent tracking id (stored as agentIds[0] on the tenant).
    agentId: z.string().trim().optional(),
    // Billing model fields (persisted so plan edits actually save).
    billingModel: z
      .enum(["hybrid", "metered_maintenance", "pure_per_minute"])
      .optional(),
    baseMonthlyFee: z.coerce.number().min(0, "Base monthly fee must be >= 0").optional(),
    includedMinutes: z.coerce.number().int().min(0, "Included minutes must be >= 0").optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "No fields to update");

export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

/** Parses a payload; returns the data or a structured 400-style error body. */
export type ParseOk<T> = { ok: true; data: T };
export type ParseFail = { ok: false; error: { error: string; fields?: Record<string, string> }; status: 400 };

export function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): ParseOk<z.infer<T>> | ParseFail {
  const result = schema.safeParse(body);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      if (!fields[key]) fields[key] = issue.message;
    }
    return { ok: false, error: { error: "Validation failed", fields }, status: 400 };
  }
  return { ok: true, data: result.data };
}

/** Maps a known internal error code to a safe public message + status. */
export function safeError(err: unknown): { error: string; status: number } {
  if (err instanceof RetellApiError) {
    return { error: err.message, status: err.status };
  }
  if (err instanceof Error) {
    if (err.message === "USERNAME_TAKEN") {
      return { error: "A tenant with that username already exists", status: 409 };
    }
    if (err.message.startsWith("AGENT_ID_CONFLICT:")) {
      const conflictId = err.message.split(":")[1];
      return {
        error: `Agent ID is already assigned to tenant ${conflictId}. Each agent can only belong to one tenant.`,
        status: 409,
      };
    }
    // Never surface raw internal messages (e.g. Retell API errors).
  }
  return { error: "Internal server error", status: 500 };
}
