// app/(dashboard)/agents/page.tsx
//
// Client "Agents" viewport. Shows the active AI agent profile, the phone
// number configuration(s) the agent answers on, and a read-only script
// preview. Data is derived from the live call feed (agent name + business
// line) and the session tenant (client name).
"use client";

import { useEffect, useState } from "react";
import { Bot, Phone, FileText, Circle, ChevronDown } from "lucide-react";
import type { VoicerelyCallView } from "@/lib/transform";

interface MeResponse {
  user: { id: string; username: string; clientName: string; isAdmin: boolean } | null;
}

interface AgentProfile {
  name: string;
  status: "Active" | "Idle";
  totalCalls: number;
  businessLine: string;
}

// Representative read-only script preview. In production this would be sourced
// from the tenant's approved conversation script; shown here as a clean,
// non-editable reference block.
const SCRIPT_PREVIEW = [
  "Greeting: “Thanks for calling {ClientName}, this is your Voicerely assistant — how can I help you today?”",
  "Verify: Confirm the caller’s account using the last 4 digits of their phone number.",
  "Intent: Classify the request (billing, support, scheduling, or general info).",
  "Resolve: Pull the relevant record, summarize options, and confirm the caller’s choice.",
  "Close: Recap the outcome, set any follow-ups, and end with a polite sign-off.",
];

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-hover rounded ${className}`} />;
}

export default function AgentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [scriptOpen, setScriptOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [meRes, callsRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/calls?limit=100"),
        ]);
        if (!meRes.ok || !callsRes.ok) throw new Error("Failed to load agent data");
        const me: MeResponse = await meRes.json();
        const calls: { calls: VoicerelyCallView[] } = await callsRes.json();
        if (cancelled) return;

        setClientName(me.user?.clientName ?? "Your Account");

        const list = calls.calls ?? [];
        const names = Array.from(new Set(list.map((c) => c.agentName).filter(Boolean)));
        const businessLines = Array.from(
          new Set(list.map((c) => c.customerNumber).filter(Boolean))
        );
        setAgent({
          name: names[0] ?? "Primary Voice Agent",
          status: list.length > 0 ? "Active" : "Idle",
          totalCalls: list.length,
          businessLine: businessLines[0] ?? "+1 (800) 555-0100",
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Agents</h1>
        <p className="text-sm text-muted mt-1">Your active AI agent profile and configuration.</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-64 lg:col-span-2" />
        </div>
      ) : error ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-sm text-danger">
          {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Agent profile */}
          <section className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-accent/15 flex items-center justify-center">
                <Bot className="w-5 h-5 text-accent" />
              </div>
              <div className="min-w-0">
                <h2 className="text-foreground font-semibold truncate">{agent?.name}</h2>
                <p className="text-xs text-muted">{clientName}</p>
              </div>
              <span
                className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  agent?.status === "Active" ? "bg-accent/15 text-accent" : "bg-muted/15 text-muted"
                }`}
              >
                <Circle className="w-1.5 h-1.5 fill-current" />
                {agent?.status}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm border-t border-border pt-4">
              <div>
                <dt className="text-xs text-muted">Total Calls Handled</dt>
                <dd className="text-foreground tabular-nums">{agent?.totalCalls}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Agent Type</dt>
                <dd className="text-foreground">Conversational Voice</dd>
              </div>
            </dl>
          </section>

          {/* Phone number configuration */}
          <section className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-accent" />
              <h2 className="text-foreground font-semibold">Phone Configuration</h2>
            </div>
            <div className="flex items-center justify-between gap-3 border border-border rounded-lg px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs text-muted">Business Line</p>
                <p className="text-foreground tabular-nums truncate">{agent?.businessLine}</p>
              </div>
              <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-accent/15 text-accent">
                <Circle className="w-1.5 h-1.5 fill-current" />
                Connected
              </span>
            </div>
            <p className="text-xs text-muted">
              Inbound calls to this number are answered by your active voice agent.
            </p>
          </section>

          {/* Read-only script preview — collapsible accordion */}
          <section className="bg-surface border border-border rounded-2xl lg:col-span-2 overflow-hidden">
            <button
              type="button"
              onClick={() => setScriptOpen((o) => !o)}
              aria-expanded={scriptOpen}
              className="w-full flex items-center gap-2 px-6 py-4 text-left transition hover:bg-surface-hover"
            >
              <FileText className="w-4 h-4 text-accent" />
              <span className="text-foreground font-semibold">View Active Agent Script Guidelines</span>
              <span className="ml-auto text-xs text-muted">Read-only</span>
              <ChevronDown
                className={`w-4 h-4 text-muted transition-transform duration-200 ${scriptOpen ? "rotate-180" : ""}`}
              />
            </button>
            {scriptOpen && (
              <ol className="flex flex-col gap-2 px-6 pb-6">
                {SCRIPT_PREVIEW.map((line, i) => (
                  <li
                    key={i}
                    className="flex gap-3 text-sm text-muted bg-background-alt border border-border rounded-lg px-3 py-2"
                  >
                    <span className="text-accent font-semibold tabular-nums shrink-0">{i + 1}.</span>
                    <span className="text-foreground/90">{line}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}