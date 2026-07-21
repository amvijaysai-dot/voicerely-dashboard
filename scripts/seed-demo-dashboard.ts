//
// scripts/seed-demo-dashboard.ts
//
// Deterministic demo-data seed for the "test-client" tenant.
//
// Creates 250 realistic CallLog records spanning the last 30 days,
// updates tenant billing fields, and inserts AuditLog entries for
// Live Logs history.
//
// Usage:  npm run seed:demo
// Env:    DATA_DRIVER=postgres (reads DATABASE_URL / DIRECT_URL from .env.local)
//
// SAFETY: Deletes ONLY "test-client" CallLogs + AuditLogs. All other
//         tenants are preserved. No production code is modified.
//

import { config } from "dotenv";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

config({ path: ".env.local" });

const pool = new Pool({
  connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL,
  max: 10,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── Constants ──────────────────────────────────────────────────────────────
const TENANT_USERNAME = "test-client";
const TENANT_ID = "test-client";

const TOTAL_CALLS = 250;
const INBOUND_COUNT = 180;
const OUTBOUND_COUNT = 70;
const HOUR_MS = 3_600_000;

// Target dashboard metrics
const PER_MINUTE_RATE = 0.6; // 381 / 635

// Agent IDs (deterministic fake Retell agent IDs)
const AGENT_IDS = [
  "agent_appointment_scheduler_a1b2c3d4",
  "agent_support_desk_e5f6g7h8",
  "agent_pricing_sales_i9j0k1l2",
  "agent_faq_bot_m3n4o5p6",
  "agent_business_hours_q7r8s9t0",
];

// ─── Transcript Templates ───────────────────────────────────────────────────

interface TranscriptTemplate {
  agentId: string;
  turns: { role: "agent" | "user"; content: string }[];
}

const TRANSCRIPT_TEMPLATES: Record<string, TranscriptTemplate[]> = {
  appointment: [
    {
      agentId: AGENT_IDS[0],
      turns: [
        { role: "agent", content: "Thank you for calling Acme Health Services. My name is Sarah. How can I assist you today?" },
        { role: "user", content: "Hi, I'd like to schedule an appointment with Dr. Johnson for a routine checkup." },
        { role: "agent", content: "I'd be happy to help you with that. Let me check Dr. Johnson's availability. Are you looking for morning or afternoon appointments?" },
        { role: "user", content: "Morning would be ideal if possible." },
        { role: "agent", content: "We have availability this coming Thursday at 10:00 AM or Friday at 9:30 AM. Would either of those work for you?" },
        { role: "user", content: "Thursday at 10 AM sounds perfect." },
        { role: "agent", content: "Great! I've booked you for Thursday at 10:00 AM with Dr. Johnson. You'll receive a confirmation text shortly. Is there anything else I can help you with?" },
        { role: "user", content: "No, that's all. Thank you!" },
        { role: "agent", content: "You're welcome! Have a great day, and we look forward to seeing you on Thursday." },
      ],
    },
    {
      agentId: AGENT_IDS[0],
      turns: [
        { role: "agent", content: "Welcome to Dental Care Plus. How may I assist you today?" },
        { role: "user", content: "I need to reschedule my cleaning appointment for next week." },
        { role: "agent", content: "Of course! Let me pull up your account. Could I have your name and date of birth please?" },
        { role: "user", content: "Michael Thompson, born March 15, 1985." },
        { role: "agent", content: "Thank you Michael. I see you have a cleaning scheduled for next Tuesday at 2:00 PM. What date works better for you?" },
        { role: "user", content: "Could I come in Thursday afternoon instead?" },
        { role: "agent", content: "Absolutely. We have Thursday at 3:30 PM open. Would that work?" },
        { role: "user", content: "Perfect, thank you!" },
        { role: "agent", content: "You're all set for Thursday at 3:30 PM. We'll send a reminder the day before. Is there anything else?" },
        { role: "user", content: "No, that's great. Thanks!" },
      ],
    },
  ],
  support: [
    {
      agentId: AGENT_IDS[1],
      turns: [
        { role: "agent", content: "Thank you for contacting TechSupport Pro. This is Emily. How can I help you today?" },
        { role: "user", content: "I'm having trouble logging into my account. It keeps saying invalid password." },
        { role: "agent", content: "I'm sorry to hear that. Let me help you get that sorted out. Have you tried resetting your password using the 'Forgot Password' link?" },
        { role: "user", content: "Yes, I tried that but I'm not receiving the reset email." },
        { role: "agent", content: "Let me check your account. Could you please confirm the email address associated with your account?" },
        { role: "user", content: "It's john.doe@example.com." },
        { role: "agent", content: "Thank you. I can see your account is active. Let me send a password reset from my end. You should receive an email within a few minutes." },
        { role: "user", content: "Okay, I'll wait and check." },
        { role: "agent", content: "I've triggered the reset. In the meantime, could you check your spam folder as well?" },
        { role: "user", content: "Yes, I found it in spam! Got it. Thanks for your help." },
        { role: "agent", content: "You're welcome! Make sure to choose a strong password. Is there anything else I can assist you with?" },
        { role: "user", content: "No, that's all. Have a great day!" },
      ],
    },
    {
      agentId: AGENT_IDS[1],
      turns: [
        { role: "agent", content: "Welcome to CloudServices Inc. How may I help you today?" },
        { role: "user", content: "My dashboard is loading very slowly and some charts aren't displaying." },
        { role: "agent", content: "I understand that must be frustrating. Let me look into what's happening. Could you tell me which specific dashboard you're referring to?" },
        { role: "user", content: "The analytics dashboard under the Reports section." },
        { role: "agent", content: "Thank you. Could you try clearing your browser cache and refreshing the page? Also, could you let me know which browser you're using?" },
        { role: "user", content: "I'm using Chrome. Let me try clearing the cache." },
        { role: "agent", content: "Great, please let me know if that helps." },
        { role: "user", content: "Yes, that seems to have fixed it! Everything is loading normally now." },
        { role: "agent", content: "Excellent! That's good to hear. We also recommend using Chrome for the best experience. Is there anything else I can help with?" },
        { role: "user", content: "No, that's all. Thanks for your quick help!" },
      ],
    },
  ],
  pricing: [
    {
      agentId: AGENT_IDS[2],
      turns: [
        { role: "agent", content: "Thanks for calling SalesPro Solutions! I'm Alex. How can I assist you today?" },
        { role: "user", content: "I'd like to get pricing information for your enterprise plan." },
        { role: "agent", content: "I'd be happy to walk you through our enterprise options. Our enterprise plan starts at $2,500 per month and includes up to 50 users, dedicated support, and custom integrations. Would you like me to go into more detail?" },
        { role: "user", content: "That sounds reasonable. Does it include API access?" },
        { role: "agent", content: "Yes, absolutely. All enterprise plans include full API access with rate limits of 10,000 requests per hour. We also provide a dedicated account manager and 99.9% uptime SLA." },
        { role: "user", content: "What about onboarding and training?" },
        { role: "agent", content: "We include a comprehensive onboarding package with your first month, including data migration assistance, team training sessions, and personalized setup support." },
        { role: "user", content: "That sounds good. Can I schedule a demo to see it in action?" },
        { role: "agent", content: "Of course! I can schedule a demo for you this Thursday at 2:00 PM or Friday at 11:00 AM. Which works better for you?" },
        { role: "user", content: "Thursday at 2 PM works great." },
        { role: "agent", content: "Perfect! I've scheduled your demo for Thursday at 2:00 PM. You'll receive a confirmation email with the meeting link. Is there anything else I can help with?" },
        { role: "user", content: "No, that's all. Looking forward to the demo!" },
      ],
    },
    {
      agentId: AGENT_IDS[2],
      turns: [
        { role: "agent", content: "Thank you for reaching out to SaaSify! This is Jordan. How can I help?" },
        { role: "user", content: "I'm looking at your Pro plan but I'm not sure it fits our needs." },
        { role: "agent", content: "I'd be happy to help clarify. The Pro plan at $99 per month includes unlimited projects, 500 GB storage, and priority support. What specific concerns do you have?" },
        { role: "user", content: "We need more storage and we have a team of about 20 people." },
        { role: "agent", content: "For a team of 20 with higher storage needs, I'd recommend our Business plan at $249 per month. It includes 2 TB storage, advanced permissions, audit logs, and API access. It would be more cost-effective than adding Pro seats." },
        { role: "user", content: "That makes sense. Is there a discount for annual billing?" },
        { role: "agent", content: "Yes! With annual billing you get two months free, bringing it to approximately $207.50 per month. Would you like me to send over a detailed comparison?" },
        { role: "user", content: "Yes, please send that over. I'll discuss with my team." },
        { role: "agent", content: "I'll email that to you right away. You'll also receive a link to schedule a call with our solutions team if you'd like to discuss further. Is there anything else?" },
        { role: "user", content: "No, that's helpful. Thanks!" },
      ],
    },
  ],
  faq: [
    {
      agentId: AGENT_IDS[3],
      turns: [
        { role: "agent", content: "Hi, welcome to QuickHelp Support. I'm your virtual assistant. How can I help you today?" },
        { role: "user", content: "What are your business hours?" },
        { role: "agent", content: "Our business hours are Monday through Friday, 8:00 AM to 6:00 PM EST, and Saturday from 9:00 AM to 1:00 PM EST. We're closed on Sundays and major holidays." },
        { role: "user", content: "Do you offer 24/7 support for emergencies?" },
        { role: "agent", content: "Yes, we do offer 24/7 emergency support for critical issues. You can reach our emergency line by calling our main number and pressing 9, or by submitting an urgent ticket through your dashboard." },
        { role: "user", content: "Great, thanks for the info!" },
        { role: "agent", content: "You're welcome! Is there anything else I can help with?" },
        { role: "user", content: "No, that's all I needed. Have a good day!" },
      ],
    },
    {
      agentId: AGENT_IDS[3],
      turns: [
        { role: "agent", content: "Welcome to FAQ Bot! How may I assist you?" },
        { role: "user", content: "How do I reset my two-factor authentication?" },
        { role: "agent", content: "To reset your two-factor authentication, please follow these steps: 1) Log into your account settings, 2) Navigate to the Security section, 3) Click on 'Manage Two-Factor Authentication', 4) Follow the prompts to set up a new authentication method. Would you like me to walk you through it?" },
        { role: "user", content: "I'm getting an error when I try to scan the QR code." },
        { role: "agent", content: "I see. Let me check a few things. First, make sure you're using a supported authenticator app like Google Authenticator, Authy, or Microsoft Authenticator. Also, ensure that your device's date and time are set correctly." },
        { role: "user", content: "Okay, let me check that. Actually, the time was off by a few minutes. I've corrected it and it's working now." },
        { role: "agent", content: "Excellent! That's a common issue. Glad we could resolve it quickly. Is there anything else I can help with?" },
        { role: "user", content: "No, that solved it. Thanks!" },
      ],
    },
  ],
  hours: [
    {
      agentId: AGENT_IDS[4],
      turns: [
        { role: "agent", content: "Thank you for calling City Services Center. How may I direct your call?" },
        { role: "user", content: "I need to know if you're open on Memorial Day." },
        { role: "agent", content: "We will be closed on Memorial Day, Monday May 27th. We will resume normal business hours on Tuesday. Would you like to schedule an appointment for Tuesday instead?" },
        { role: "user", content: "Yes, please schedule for Tuesday morning." },
        { role: "agent", content: "We have availability at 9:00 AM, 10:00 AM, or 11:00 AM on Tuesday. Which works best for you?" },
        { role: "user", content: "10 AM would be perfect." },
        { role: "agent", content: "You're booked for Tuesday at 10:00 AM. You'll receive a reminder the day before. Is there anything else?" },
        { role: "user", content: "No, thank you!" },
      ],
    },
  ],
  voicemail: [
    {
      agentId: AGENT_IDS[1],
      turns: [
        { role: "agent", content: "You've reached the voicemail of TechSupport Pro. Please leave a message after the tone, and we'll get back to you within 2 business hours." },
        { role: "user", content: "Hi, this is Sarah Mitchell calling about my account issue. I've been unable to access my dashboard since yesterday. Please call me back at 555-0123. Thank you." },
      ],
    },
    {
      agentId: AGENT_IDS[2],
      turns: [
        { role: "agent", content: "Thank you for calling SalesPro Solutions. All our representatives are currently busy. Please leave a message and we'll return your call as soon as possible." },
        { role: "user", content: "Hi, I'm interested in your enterprise plan for my company. We're a mid-sized business with about 100 employees. Please call me back at your earliest convenience. My number is 555-4567. Thanks!" },
      ],
    },
  ],
  transferred: [
    {
      agentId: AGENT_IDS[1],
      turns: [
        { role: "agent", content: "Thank you for calling. I'm going to transfer you to our billing department who can better assist you with this matter." },
        { role: "user", content: "Okay, thank you." },
        { role: "agent", content: "Please hold while I connect you." },
      ],
    },
    {
      agentId: AGENT_IDS[1],
      turns: [
        { role: "agent", content: "Let me transfer you to a senior support specialist who can handle this complex issue." },
        { role: "user", content: "That would be great, thanks." },
        { role: "agent", content: "One moment please, I'm connecting you now." },
      ],
    },
  ],
};

function getAllTemplates(): { template: TranscriptTemplate; category: string }[] {
  const all: { template: TranscriptTemplate; category: string }[] = [];
  for (const [category, templates] of Object.entries(TRANSCRIPT_TEMPLATES)) {
    for (const t of templates) {
      all.push({ template: t, category });
    }
  }
  return all;
}

const ALL_TEMPLATES = getAllTemplates();

// ─── Deterministic helpers ──────────────────────────────────────────────────

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RNG = mulberry32(20260721);

function pick<T>(arr: T[]): T {
  return arr[Math.floor(RNG() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(RNG() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number): number {
  return RNG() * (max - min) + min;
}

function randomBool(probability: number): boolean {
  return RNG() < probability;
}

function generateCallId(index: number): string {
  const hex = (index * 7919 + 12345).toString(16).padStart(24, "0");
  return `call_${hex}`;
}

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Call generation ────────────────────────────────────────────────────────

interface DemoCall {
  tenantId: string;
  callId: string;
  agentId: string;
  totalDurationSeconds: number;
  transcript: string;
  audioUrl: string;
  disconnectionReason: string | null;
  sentiment: "Positive" | "Neutral" | "Negative" | null;
  hallucinationDetected: boolean;
  scriptDeviation: boolean;
  missedInformation: boolean;
  interruptionCount: number;
  agentTalkRatio: number;
  mistakeSummary: string | null;
  recommendedPromptCorrection: string | null;
  createdAt: Date;
}

function generateCalls(): DemoCall[] {
  const calls: DemoCall[] = [];
  const DAY_MS = 86_400_000;

  const statuses: string[] = [
    ...Array(210).fill("completed"),
    ...Array(18).fill("missed"),
    ...Array(12).fill("transferred"),
    ...Array(8).fill("voicemail"),
    ...Array(2).fill("failed"),
  ];

  const directions: string[] = [
    ...Array(INBOUND_COUNT).fill("inbound"),
    ...Array(OUTBOUND_COUNT).fill("outbound"),
  ];

  const shuffledStatuses: string[] = [];
  const shuffledDirs: string[] = [];
  const statusCopy = [...statuses];
  const dirCopy = [...directions];

  while (statusCopy.length > 0) {
    const idx = Math.floor(RNG() * statusCopy.length);
    shuffledStatuses.push(statusCopy.splice(idx, 1)[0]);
  }
  while (dirCopy.length > 0) {
    const idx = Math.floor(RNG() * dirCopy.length);
    shuffledDirs.push(dirCopy.splice(idx, 1)[0]);
  }

  function pickSentiment(): "Positive" | "Neutral" | "Negative" {
    const r = RNG();
    if (r < 0.72) return "Positive";
    if (r < 0.94) return "Neutral";
    return "Negative";
  }

  const categoryWeights: { name: string; weight: number }[] = [
    { name: "appointment", weight: 35 },
    { name: "support", weight: 25 },
    { name: "pricing", weight: 15 },
    { name: "faq", weight: 12 },
    { name: "hours", weight: 8 },
    { name: "voicemail", weight: 3 },
    { name: "transferred", weight: 2 },
  ];
  const totalWeight = categoryWeights.reduce((s, c) => s + c.weight, 0);

  function pickCategory(): string {
    const r = RNG() * totalWeight;
    let cumulative = 0;
    for (const cw of categoryWeights) {
      cumulative += cw.weight;
      if (r < cumulative) return cw.name;
    }
    return "appointment";
  }

  function pickTemplateForCategory(category: string): { template: TranscriptTemplate; category: string } {
    const candidates = ALL_TEMPLATES.filter((t) => t.category === category);
    if (candidates.length === 0) return ALL_TEMPLATES[0];
    return pick(candidates);
  }

  for (let i = 0; i < TOTAL_CALLS; i++) {
    const status = shuffledStatuses[i];
    const sentiment = pickSentiment();
    const category = status === "voicemail" ? "voicemail" : status === "transferred" ? "transferred" : pickCategory();

    let agentId: string;
    if (category === "appointment") agentId = AGENT_IDS[0];
    else if (category === "support") agentId = AGENT_IDS[1];
    else if (category === "pricing") agentId = AGENT_IDS[2];
    else if (category === "faq") agentId = AGENT_IDS[3];
    else if (category === "hours") agentId = AGENT_IDS[4];
    else if (category === "voicemail") agentId = pick(AGENT_IDS);
    else agentId = pick(AGENT_IDS);

    const callId = generateCallId(i);

    let duration: number;
    if (status === "missed") {
      duration = randomInt(15, 45);
    } else if (status === "voicemail") {
      duration = randomInt(30, 90);
    } else if (status === "failed") {
      duration = randomInt(10, 60);
    } else if (status === "transferred") {
      duration = randomInt(120, 300);
    } else {
      duration = randomInt(45, 480);
    }

    const dayIndex = Math.floor((i / TOTAL_CALLS) * 30);
    const isWeekend = (() => {
      const baseDate = new Date(2026, 6, 1);
      const targetDate = new Date(baseDate.getTime() + dayIndex * DAY_MS);
      const dow = targetDate.getDay();
      return dow === 0 || dow === 6;
    })();

    let hour: number;
    if (isWeekend) {
      hour = randomInt(9, 15);
    } else {
      const hourRand = RNG();
      if (hourRand < 0.3) hour = randomInt(8, 10);
      else if (hourRand < 0.6) hour = randomInt(10, 12);
      else if (hourRand < 0.8) hour = randomInt(12, 15);
      else hour = randomInt(15, 18);
    }
    const minute = randomInt(0, 59);
    const second = randomInt(0, 59);

    let callsOnDay: number;
    if (isWeekend) {
      callsOnDay = Math.floor(randomInt(3, 7));
    } else {
      callsOnDay = Math.floor(randomInt(7, 14));
    }

    const daysAgo = 30 - 1 - Math.floor(i / callsOnDay);
    const clampedDaysAgo = Math.max(0, Math.min(29, daysAgo));
    const timestamp = new Date(
      2026, 6,
      Math.max(1, 21 - clampedDaysAgo),
      hour, minute, second
    );

    let transcript: string;
    let mistakeSummary: string | null = null;
    let recommendedPromptCorrection: string | null = null;
    let hallucinationDetected = false;
    let scriptDeviation = false;
    let missedInformation = false;
    let interruptionCount = 0;
    let agentTalkRatio = 0.0;

    if (status === "voicemail") {
      const tmpl = pick(TRANSCRIPT_TEMPLATES["voicemail"]!);
      transcript = tmpl.turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");
      agentTalkRatio = 0.5;
      interruptionCount = 0;
    } else if (status === "transferred") {
      const tmpl = pick(TRANSCRIPT_TEMPLATES["transferred"]!);
      transcript = tmpl.turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");
      agentTalkRatio = randomFloat(0.4, 0.6);
      interruptionCount = randomInt(0, 1);
    } else if (status === "missed") {
      transcript = `No answer. Call rang for ${duration} seconds without being answered.`;
      agentTalkRatio = 0;
      interruptionCount = 0;
    } else if (status === "failed") {
      transcript = `SYSTEM: Call failed due to network error.`;
      agentTalkRatio = 0;
      interruptionCount = 0;
    } else {
      const { template } = pickTemplateForCategory(category);
      transcript = template.turns.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n");
      agentTalkRatio = randomFloat(0.35, 0.65);
      interruptionCount = randomInt(0, 3);

      hallucinationDetected = randomBool(0.015);
      scriptDeviation = randomBool(0.04);
      missedInformation = randomBool(0.03);

      if (hallucinationDetected) {
        mistakeSummary = "Agent provided incorrect information about pricing tiers. Hallucination detected in LLM response.";
        recommendedPromptCorrection = "Update system prompt with explicit pricing table and instruct agent to verify rates before quoting.";
      } else if (scriptDeviation) {
        mistakeSummary = "Agent deviated from script by offering discount without authorization.";
        recommendedPromptCorrection = "Add stricter guardrails around discount approval flow in agent instructions.";
      } else if (randomBool(0.03)) {
        mistakeSummary = "Agent failed to capture customer email address for follow-up confirmation.";
        recommendedPromptCorrection = "Add mandatory fields checklist to call conclusion phase of script.";
      }
    }

    const audioUrl = status === "voicemail" || status === "missed"
      ? ""
      : `https://voicerely-storage.s3.us-east-1.amazonaws.com/recordings/${callId}.wav`;

    let disconnectionReason: string | null = null;
    switch (status) {
      case "missed":
        disconnectionReason = "no-answer";
        break;
      case "transferred":
        disconnectionReason = "transferred";
        break;
      case "voicemail":
        disconnectionReason = "voicemail";
        break;
      case "failed":
        disconnectionReason = "error: network-timeout";
        break;
      default:
        disconnectionReason = null;
    }

    calls.push({
      tenantId: TENANT_ID,
      callId,
      agentId,
      totalDurationSeconds: duration,
      transcript,
      audioUrl,
      disconnectionReason,
      sentiment,
      hallucinationDetected,
      scriptDeviation,
      missedInformation,
      interruptionCount,
      agentTalkRatio: Math.round(agentTalkRatio * 100) / 100,
      mistakeSummary,
      recommendedPromptCorrection,
      createdAt: timestamp,
    });
  }

  return calls;
}

// ─── Webhook events (AuditLogs for Live Logs) ───────────────────────────────

const WEBHOOK_EVENTS = [
  { action: "webhook.received", level: "info" },
  { action: "webhook.call_analyzed", level: "info" },
  { action: "webhook.transcript_processed", level: "info" },
  { action: "webhook.billing_updated", level: "info" },
  { action: "webhook.metrics_updated", level: "info" },
  { action: "webhook.call_persisted", level: "info" },
];

function generateAuditLogs(callTimestamps: Date[]) {
  const logs: Prisma.AuditLogCreateManyInput[] = [];

  for (let i = 0; i < 100; i++) {
    const event = pick(WEBHOOK_EVENTS);
    const ts = callTimestamps[i % callTimestamps.length];
    const randomHourOffset = Math.floor(RNG() * 11) + 8;
    const eventTime = new Date(ts.getTime() + randomHourOffset * HOUR_MS);

    const requestId = `webhook_req_${i.toString(16).padStart(8, "0")}`;

    logs.push({
      tenantId: TENANT_ID,
      userId: null,
      requestId,
      action: event.action,
      success: true,
      level: event.level,
      error: null,
      meta: {
        source: "retell",
        callId: i < 250 ? generateCallId(i) : `call_demo_${i}`,
        duration_ms: randomInt(100, 3000),
      },
      createdAt: eventTime,
    });
  }

  logs.sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());

  return logs;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("🔍 Looking up test-client tenant...");
  const tenant = await prisma.tenant.findUnique({
    where: { username: TENANT_USERNAME },
  });

  if (!tenant) {
    console.error("❌ Tenant 'test-client' not found. Run `npm run db:seed` first.");
    process.exit(1);
  }

  console.log(`✅ Found tenant: ${tenant.clientName} (${tenant.id})`);

  // Step 1: Delete existing demo data
  console.log("🗑️  Removing existing demo CallLog records...");
  const deletedCalls = await prisma.callLog.deleteMany({
    where: { tenantId: TENANT_ID },
  });
  console.log(`   Removed ${deletedCalls.count} CallLog records`);

  console.log("🗑️  Removing existing demo AuditLog records...");
  const deletedAudits = await prisma.auditLog.deleteMany({
    where: { tenantId: TENANT_ID },
  });
  console.log(`   Removed ${deletedAudits.count} AuditLog records`);

  // Step 2: Generate deterministic call data
  console.log("📊 Generating 250 deterministic demo calls...");
  const calls = generateCalls();

  const totalSecs = calls.reduce((sum, c) => sum + c.totalDurationSeconds, 0);
  const avgSecs = Math.round(totalSecs / calls.length);
  const totalMins = Math.round((totalSecs / 60) * 100) / 100;
  const completed = calls.filter((c) => c.disconnectionReason === null).length;
  const missed = calls.filter((c) => c.disconnectionReason === "no-answer").length;
  const transferred = calls.filter((c) => c.disconnectionReason === "transferred").length;
  const voicemail = calls.filter((c) => c.disconnectionReason === "voicemail").length;
  const failed = calls.filter((c) => c.disconnectionReason?.startsWith("error")).length;

  console.log(`   Total calls: ${calls.length}`);
  console.log(`   Total minutes: ${totalMins}`);
  console.log(`   Avg duration: ${avgSecs}s (${formatDuration(avgSecs)})`);
  console.log(`   Completed (Answered): ${completed}`);
  console.log(`   Missed: ${missed}`);
  console.log(`   Transferred: ${transferred}`);
  console.log(`   Voicemail: ${voicemail}`);
  console.log(`   Failed: ${failed}`);

  // Step 3: Insert calls in batches
  console.log("💾 Inserting CallLog records...");
  const BATCH_SIZE = 50;
  let insertedCount = 0;
  for (let i = 0; i < calls.length; i += BATCH_SIZE) {
    const batch = calls.slice(i, i + BATCH_SIZE);
    await prisma.callLog.createMany({ data: batch });
    insertedCount += batch.length;
    console.log(`   Inserted ${insertedCount}/${calls.length} records`);
  }

  // Step 4: Generate and insert AuditLog entries
  console.log("📝 Generating webhook event logs for Live Logs...");
  const callTimestamps = calls.map((c) => c.createdAt);
  const auditLogs = generateAuditLogs(callTimestamps);

  console.log(`💾 Inserting ${auditLogs.length} AuditLog records...`);
  for (let i = 0; i < auditLogs.length; i += BATCH_SIZE) {
    const batch = auditLogs.slice(i, i + BATCH_SIZE);
    await prisma.auditLog.createMany({ data: batch });
  }

  // Step 5: Update tenant billing fields
  console.log("⚙️  Updating tenant billing configuration...");
  const spend = Math.round(totalMins * PER_MINUTE_RATE * 100) / 100;
  await prisma.tenant.update({
    where: { id: TENANT_ID },
    data: {
      allowedMinutes: 1000,
      usedMinutes: Math.round(totalMins),
      perMinuteRate: PER_MINUTE_RATE,
      avgBookingValue: 210,
      billingModel: "hybrid",
      baseMonthlyFee: 0,
      includedMinutes: 0,
      billingCycleStart: new Date(2026, 5, 21),
      billingCycleEnd: new Date(2026, 6, 21),
    },
  });

  // Summary
  console.log("\n═══════════════════════════════════════════════════");
  console.log("✅ Demo data seeded successfully!");
  console.log("═══════════════════════════════════════════════════");
  console.log("");
  console.log("📊 Dashboard Metrics (approximate):");
  console.log(`   Total Calls:     ${calls.length}`);
  console.log(`   Inbound:         ${INBOUND_COUNT}`);
  console.log(`   Outbound:        ${OUTBOUND_COUNT}`);
  console.log(`   Avg Duration:    ${formatDuration(avgSecs)}`);
  console.log(`   Answered:        ${completed}`);
  console.log(`   Missed:          ${missed}`);
  console.log(`   Transferred:     ${transferred}`);
  console.log(`   Avg Sentiment:   Positive`);
  console.log(`   Avg Booking $:   $210`);
  console.log(`   Est. Revenue:    $${Math.round(completed * 210 * 0.6).toLocaleString()}`);
  console.log(`   Minutes Used:    ${Math.round(totalMins)}`);
  console.log(`   Monthly Spend:   $${spend.toFixed(2)}`);
  console.log("");
  console.log(`   CallLog records: ${insertedCount}`);
  console.log(`   AuditLog records: ${auditLogs.length}`);
  console.log("");
  console.log("ℹ️  To re-run:  npm run seed:demo");
  console.log("ℹ️  To remove:  delete CallLog + AuditLog for tenant 'test-client'");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());