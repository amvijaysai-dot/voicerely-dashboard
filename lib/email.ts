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
  password: string;
  loginUrl: string;
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
    <p>Your analytics dashboard account has been created. Here are your login details:</p>
    <table style="border-collapse:collapse; margin:16px 0;">
      <tr><td style="padding:6px 12px 6px 0; color:#64748b;">Login URL</td><td><a href="${input.loginUrl}">${input.loginUrl}</a></td></tr>
      <tr><td style="padding:6px 12px 6px 0; color:#64748b;">Username</td><td><strong>${input.username}</strong></td></tr>
      <tr><td style="padding:6px 12px 6px 0; color:#64748b;">Password</td><td><strong>${input.password}</strong></td></tr>
    </table>
    <p style="color:#64748b; font-size:13px;">For your security, please change your password after your first login.</p>
    <p style="color:#94a3b8; font-size:12px;">— The Voicerely Team</p>
  </div>`;
}

function onboardingText(input: OnboardingEmailInput): string {
  return [
    `Welcome to Voicerely, ${input.clientName}!`,
    ``,
    `Your analytics dashboard account is ready. Login details:`,
    `Login URL: ${input.loginUrl}`,
    `Username:  ${input.username}`,
    `Password:  ${input.password}`,
    ``,
    `For your security, please change your password after your first login.`,
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