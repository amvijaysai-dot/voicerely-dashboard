// lib/security/logger.ts
//
// Centralized structured logging engine. Every event is emitted as a single
// JSON telemetry line containing: timestamp, requestId, tenantId, userId,
// action, and success/error status. Output goes to console.log so it is
// captured by the runtime/container log drain (and never mixed with secrets).

import crypto from "node:crypto";

export type LogLevel = "info" | "warn" | "error";

export interface LogEvent {
  timestamp: string;
  requestId: string;
  tenantId?: string;
  userId?: string;
  action: string;
  success: boolean;
  level?: LogLevel;
  error?: string;
  meta?: Record<string, unknown>;
}

/** Generates a per-request correlation id (falls back if crypto unavailable). */
export function newRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now().toString(36)}`;
  }
}

/**
 * Emits a structured JSON telemetry block. Strictly typed; safe to call from
 * any server context (route handlers, repository). Never logs secrets.
 */
export function logEvent(event: LogEvent): void {
  const line = JSON.stringify({
    timestamp: event.timestamp,
    requestId: event.requestId,
    tenantId: event.tenantId ?? null,
    userId: event.userId ?? null,
    action: event.action,
    success: event.success,
    level: event.level ?? (event.success ? "info" : "warn"),
    error: event.error ?? null,
    ...(event.meta ? { meta: event.meta } : {}),
  });
  // Single JSON line per event for easy downstream parsing.
  if (event.success) {
    console.log(line);
  } else {
    console.warn(line);
  }
}

/** Convenience helper that stamps timestamp + requestId for an event. */
export function audit(
  requestId: string,
  action: string,
  opts: {
    tenantId?: string;
    userId?: string;
    success?: boolean;
    error?: string;
    level?: LogLevel;
    meta?: Record<string, unknown>;
  } = {}
): void {
  logEvent({
    timestamp: new Date().toISOString(),
    requestId,
    action,
    tenantId: opts.tenantId,
    userId: opts.userId,
    success: opts.success ?? true,
    error: opts.error,
    level: opts.level,
    meta: opts.meta,
  });
}