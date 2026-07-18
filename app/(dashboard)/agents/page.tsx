// app/(dashboard)/agents/page.tsx
//
// Client "Agents" viewport. Shows the tenant's REAL Retell agent
// profile(s) — voice, system prompt, and inbound phone number —
// sourced live from Retell via /api/agents. Loading and error states
// (429 rate-limit / 5xx upstream) are handled gracefully using the
// same classification the Retell wrapper emits.
"use client";

import { useEffect, useState, Fragment } from "react";
import { Bot, Phone, FileText, Circle, ChevronDown, TriangleAlert, Copy } from "lucide-react";

function CopyPromptButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }
  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 text-xs text-muted bg-surface border border-border rounded px-2 py-1 hover:text-foreground hover:bg-surface-hover transition"
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

interface MeResponse {
  user: { id: string; username: string; clientName: string; isAdmin: boolean } | null;
}

interface AgentView {
  agentId: string;
  name: string;
  voice: string;
  prompt: string;
  phone: string;
  status: "Active" | "Idle";
  demo?: boolean;
  error?: "rate_limited" | "unavailable";
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse bg-surface-hover rounded ${className}`} />;
}

export default function AgentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [agents, setAgents] = useState<AgentView[]>([]);
  const [scriptOpen, setScriptOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [meRes, agentsRes] = await Promise.all([
          fetch("/api/auth/me"),
          fetch("/api/agents"),
        ]);
        if (!meRes.ok) throw new Error("Failed to load account");
        const me: MeResponse = await meRes.json();
        if (cancelled) return;

        setClientName(me.user?.clientName ?? "Your Account");

        if (!agentsRes.ok) {
          const status = agentsRes.status;
          throw new Error(
            status === 429
              ? "Rate limit reached loading agents. Please retry shortly."
              : "Unable to load agent configuration right now."
          );
        }
        const data: { agents: AgentView[] } = await agentsRes.json();
        if (cancelled) return;
        setAgents(data.agents ?? []);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Unknown error");
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
        <div className="bg-surface border border-border rounded-2xl p-6 text-sm text-danger flex items-start gap-2">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : agents.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-6 text-sm text-muted">
          No agents are configured for this account yet. Add an agent ID in the admin
          portal to see its live voice, prompt, and phone configuration here.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {agents.map((agent) => {
            const open = scriptOpen[agent.agentId] ?? false;
            const degraded = Boolean(agent.error);
            return (
              <Fragment key={agent.agentId}>
                {/* Agent profile */}
                <section className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl bg-accent/15 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-accent" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-foreground font-semibold truncate">{agent.name}</h2>
                      <p className="text-xs text-muted">{clientName}</p>
                    </div>
                    <span
                      className={`ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        agent.status === "Active"
                          ? "bg-accent/15 text-accent"
                          : "bg-muted/15 text-muted"
                      }`}
                    >
                      <Circle className="w-1.5 h-1.5 fill-current" />
                      {agent.status}
                    </span>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm border-t border-border pt-4">
                    <div>
                      <dt className="text-xs text-muted">Voice</dt>
                      <dd className="text-foreground truncate">{agent.voice}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Agent Type</dt>
                      <dd className="text-foreground">Conversational Voice</dd>
                    </div>
                  </dl>
                  {degraded && (
                    <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
                      {agent.error === "rate_limited"
                        ? "Live config is rate-limited. Showing last known details."
                        : "Live config is temporarily unavailable. Showing cached details."}
                    </p>
                  )}
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
                      <p className="text-foreground tabular-nums truncate">{agent.phone}</p>
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

                {/* Prompt preview — scrollable, max height, with copy button */}
                <section className="bg-surface border border-border rounded-2xl lg:col-span-2 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setScriptOpen((o) => ({ ...o, [agent.agentId]: !o[agent.agentId] }))}
                    aria-expanded={!!scriptOpen[agent.agentId]}
                    className="w-full flex items-center gap-2 px-6 py-4 text-left transition hover:bg-surface-hover"
                  >
                    <FileText className="w-4 h-4 text-accent" />
                    <span className="text-foreground font-semibold">Agent System Prompt</span>
                    <span className="ml-auto text-xs text-muted">Read-only</span>
                    <ChevronDown
                      className={`w-4 h-4 text-muted transition-transform duration-200 ${scriptOpen[agent.agentId] ? "rotate-180" : ""}`}
                    />
                  </button>
                  {scriptOpen[agent.agentId] && (
                    <div className="px-6 pb-6">
                      <div className="relative">
                        <pre className="text-sm text-foreground/90 bg-background-alt border border-border rounded-lg px-4 py-3 overflow-y-auto max-h-64 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                          {agent.prompt || "No prompt configured for this agent."}
                        </pre>
                        {agent.prompt && (
                          <CopyPromptButton text={agent.prompt} />
                        )}
                      </div>
                    </div>
                  )}
                </section>
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
