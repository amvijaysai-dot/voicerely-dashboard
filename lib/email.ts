// lib/email.ts
//
// Lightweight email transport for Voicerely notifications. Uses nodemailer with
// an SMTP configuration sourced from environment variables (see .env.example).
// All sending is best-effort: callers should `.catch()` so a mail failure never
// breaks the primary operation (e.g. tenant creation).
//
// When SMTP credentials are not configured the module logs a preview of the
// message to the server console instead of throwing, so local/dev runs stay
// functional without a real mail server.

import nodemailer from "nodemailer";

export interface OnboardingEmailInput {
  to: string;
  clientName: string;
  username: string;
  /** Secure, single-use setup link. The raw password is NEVER emailed. */
  setupUrl: string;
}

function buildTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  // No SMTP config present -> console transport (dev / preview mode).
  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user, pass },
  });
}

function onboardingHtml(input: OnboardingEmailInput): string {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; color:#111; max-width:520px; margin:0 auto;">
    <h2 style="color:#0f172a;">Welcome to Voicerely, ${input.clientName}!</h2>
    <p>Your analytics dashboard account has been created. For your security we never
       email a password — set your own using the secure link below.</p>
    <p style="margin:20px 0;">
      <a href="${input.setupUrl}"
         style="background:#0f172a; color:#fff; padding:12px 20px; border-radius:8px; text-decoration:none;">
        Set your password
      </a>
    </p>
    <p style="color:#64748b; font-size:13px;">This link expires in 24 hours and can be used only once.
       Your username is <strong>${input.username}</strong>.</p>
    <p style="color:#94a3b8; font-size:12px;">— The Voicerely Team</p>
  </div>`;
}

function onboardingText(input: OnboardingEmailInput): string {
  return [
    `Welcome to Voicerely, ${input.clientName}!`,
    ``,
    `Your analytics dashboard account is ready. For your security we never email a`,
    `password — set your own using this secure, one-time link (expires in 24h):`,
    ``,
    `  ${input.setupUrl}`,
    ``,
    `Your username is: ${input.username}`,
    ``,
    `— The Voicerely Team`,
  ].join("\n");
}

/** Sends the onboarding email to a newly created client tenant. */
export async function sendOnboardingEmail(input: OnboardingEmailInput): Promise<void> {
  const from = process.env.SMTP_FROM ?? "Voicerely <no-reply@voicerely.app>";
  const subject = "Welcome to Voicerely — Your Dashboard Login";

  const transport = buildTransport();

  if (!transport) {
    // Dev / preview mode: surface the would-be email in the server logs.
    console.info(
      `[email:preview] Onboarding email to ${input.to}\n` +
        `  Subject: ${subject}\n` +
        onboardingText(input)
    );
    return;
  }

  await transport.sendMail({
    from,
    to: input.to,
    subject,
    text: onboardingText(input),
    html: onboardingHtml(input),
  });
}