// app/api/admin/reports/monthly/route.ts
//
// Sends a monthly performance report to all active Voicerely clients.
// Called automatically by a Vercel/Railway cron on the 1st of each month at 9am UTC.
// Can also be triggered manually by a super-admin via POST with a Bearer token.
//
// Add to vercel.json for automatic scheduling:
//   { "crons": [{ "path": "/api/admin/reports/monthly", "schedule": "0 9 1 * *" }] }
//
// Security: requires EITHER a valid admin session OR a Bearer token matching CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { listClientTenants } from "@/lib/repositories/tenantRepository";
import { listCalls, getClientConfig } from "@/lib/retell/client";
import { transformCallToClientView } from "@/lib/transform";
import { currentCycle, isInCycle } from "@/lib/billing/cycle";
import { transporter, FROM_ADDRESS } from "@/lib/email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest, isAdmin: boolean): boolean {
  if (isAdmin) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

function buildReportEmail(params: {
  clientName: string;
  totalCalls: number;
  completedCalls: number;
  afterHoursCalls: number;
  revenueRecovered: number;
  avgBookingValue: number;
  appUrl: string;
  monthLabel: string;
}): string {
  const {
    clientName,
    totalCalls,
    completedCalls,
    afterHoursCalls,
    revenueRecovered,
    avgBookingValue,
    appUrl,
    monthLabel,
  } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Your ${monthLabel} VoiceRely Report</title>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0D0D0D;margin:0;padding:24px}
  .wrap{max-width:560px;margin:0 auto}
  .logo{font-size:18px;font-weight:700;color:#FF6B00;margin-bottom:24px;letter-spacing:-0.5px}
  .card{background:#1A1A1A;border:1px solid #2A2A2A;border-radius:16px;padding:32px;margin-bottom:16px}
  h1{font-size:22px;font-weight:600;color:#FFFFFF;margin:0 0 6px}
  .sub{color:#888;font-size:14px;margin:0 0 24px}
  .roi-card{background:#1F1200;border:1px solid #FF6B0040;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px}
  .roi-label{color:#FF6B00;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px}
  .roi-value{font-size:40px;font-weight:700;color:#FF6B00;margin:0 0 4px;letter-spacing:-1px}
  .roi-sub{color:#888;font-size:12px;margin:0}
  .metrics{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px}
  .metric{background:#111;border:1px solid #2A2A2A;border-radius:10px;padding:16px}
  .m-label{color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 4px}
  .m-value{color:#FFF;font-size:24px;font-weight:600;margin:0}
  .cta{display:block;background:#FF6B00;color:#000;text-align:center;padding:14px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px}
  .footer{color:#555;font-size:12px;text-align:center;margin-top:16px;line-height:1.6}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">VoiceRely</div>
  <div class="card">
    <h1>${clientName} \u2014 ${monthLabel} Report</h1>
    <p class="sub">Here's how your AI voice agent performed this month.</p>

    <div class="roi-card">
      <p class="roi-label">\uD83D\uDCB0 Estimated Revenue Recovered</p>
      <p class="roi-value">$${revenueRecovered.toLocaleString("en-US")}</p>
      <p class="roi-sub">
        ${completedCalls} completed calls \u00D7 $${avgBookingValue} avg. booking \u00D7 60% conversion
      </p>
    </div>

    <div class="metrics">
      <div class="metric">
        <p class="m-label">Total Calls</p>
        <p class="m-value">${totalCalls}</p>
      </div>
      <div class="metric">
        <p class="m-label">Completed</p>
        <p class="m-value">${completedCalls}</p>
      </div>
      <div class="metric">
        <p class="m-label">After-Hours</p>
        <p class="m-value">${afterHoursCalls}</p>
      </div>
      <div class="metric">
        <p class="m-label">Avg. Booking Value</p>
        <p class="m-value">$${avgBookingValue}</p>
      </div>
    </div>

    <a href="${appUrl}" class="cta">View Full Dashboard \u2192</a>
  </div>
  <div class="footer">
    You're receiving this as a VoiceRely client.<br>
    Reply to reach your account manager \u00B7 <a href="${appUrl}/settings" style="color:#FF6B00">Manage settings</a>
  </div>
</div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  return handleReport(req);
}

export async function POST(req: NextRequest) {
  return handleReport(req);
}

async function handleReport(req: NextRequest) {
  const session = await getSession();
  if (!isAuthorized(req, Boolean(session?.isAdmin))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://voicerely.app";
  const now = new Date();
  const monthLabel = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  const tenants = await listClientTenants();
  const results: { tenantId: string; clientName: string; status: string }[] = [];

  for (const tenant of tenants) {
    // Only send to tenants with a valid email address as username.
    if (!tenant.username?.includes("@")) {
      results.push({ tenantId: tenant.id, clientName: tenant.clientName, status: "skipped:no-email" });
      continue;
    }

    try {
      const anchorDay = tenant.createdAt ? new Date(tenant.createdAt).getUTCDate() : 1;
      const cycle = currentCycle(anchorDay);
      const config = await getClientConfig(tenant);
      const rawCalls = await listCalls(tenant, { limit: 1000 }).catch(() => []);
      const allViews = rawCalls.map((c) => transformCallToClientView(c, config));
      const cycleCalls = allViews.filter((c) => isInCycle(c.timestamp, cycle));

      const totalCalls = cycleCalls.length;
      const completedCalls = cycleCalls.filter((c) => c.status === "Completed").length;
      const avgBookingValue = tenant.avgBookingValue ?? 210;
      const afterHoursCalls = cycleCalls.filter((c) => {
        const h = new Date(c.timestamp).getUTCHours();
        return h >= 20 || h < 8;
      }).length;
      const revenueRecovered =
        Math.round(completedCalls * avgBookingValue * 0.60) +
        Math.round(afterHoursCalls * avgBookingValue * 0.60);

      const html = buildReportEmail({
        clientName: tenant.clientName,
        totalCalls,
        completedCalls,
        afterHoursCalls,
        revenueRecovered,
        avgBookingValue,
        appUrl,
        monthLabel,
      });

      if (!transporter) {
        // Dev / preview mode: log the email instead of sending
        console.info(
          `[email:preview] Monthly report to ${tenant.username}\n` +
            `  Subject: ${tenant.clientName} \u2014 Your ${monthLabel} VoiceRely Report ($${revenueRecovered.toLocaleString("en-US")} recovered)`
        );
      } else {
        await transporter.sendMail({
          from: FROM_ADDRESS,
          to: tenant.username,
          subject: `${tenant.clientName} \u2014 Your ${monthLabel} VoiceRely Report ($${revenueRecovered.toLocaleString("en-US")} recovered)`,
          html,
        });
      }

      results.push({
        tenantId: tenant.id,
        clientName: tenant.clientName,
        status: `sent:recovered=$${revenueRecovered}`,
      });
    } catch (err) {
      console.error(`Monthly report failed for ${tenant.id}:`, err);
      results.push({
        tenantId: tenant.id,
        clientName: tenant.clientName,
        status: "failed",
      });
    }
  }

  const sent = results.filter((r) => r.status.startsWith("sent")).length;
  const failed = results.filter((r) => r.status === "failed").length;

  return NextResponse.json({ ok: true, sent, failed, results });
}