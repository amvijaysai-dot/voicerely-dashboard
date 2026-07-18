// lib/errors.ts
//
// Typed application errors. RetellApiError carries a clean HTTP status + a
// safe public message so upstream failures (429 rate limits, 5xx, timeouts)
// can be surfaced to clients without leaking raw upstream bodies.

export class RetellApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RetellApiError";
    this.status = status;
  }
}