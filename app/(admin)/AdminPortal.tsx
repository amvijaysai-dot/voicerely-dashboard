// app/(admin)/AdminPortal.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, KeyRound, Pencil, Trash2, X, Users, Receipt, Copy, Check, Webhook, LogOut, User, Mail, AtSign, ChevronDown } from "lucide-react";
import { StatusToggle } from "@/components/admin/StatusToggle";
import { AgentHealthPanel } from "@/components/admin/AgentHealthPanel";
import { ClientDiagnosticView } from "@/components/admin/ClientDiagnosticView";
import { AdminSidebar, ADMIN_NAV, type AdminTab } from "@/components/admin/AdminSidebar";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import type { AgentHealthReport } from "@/lib/analytics/agentHealth";
import type { CallLog } from "@/lib/db";

interface SessionUser {
  id: string;
  username: string;
  clientName: string;
  email?: string;
  isAdmin: boolean;
}

interface TenantRow {
  id: string;
  clientName: string;
  username: string;
  allowedMinutes: number;
  usedMinutes: number;
  perMinuteRate: number;
  status: "active" | "suspended";
  hasRetellKey: boolean;
  agentId: string;
  billingModel?: "hybrid" | "metered_maintenance" | "pure_per_minute";
  baseMonthlyFee?: number;
  includedMinutes?: number;
}

interface FormState {
  clientName: string;
  username: string;
  password: string;
  email: string;
  billingModel: "hybrid" | "metered_maintenance" | "pure_per_minute";
  baseMonthlyFee: string;
  includedMinutes: string;
  perMinuteRate: string;
  retellApiKey: string;
  agentId: string;
}

const EMPTY: FormState = {
  clientName: "",
  username: "",
  password: "",
  email: "",
  billingModel: "hybrid",
  baseMonthlyFee: "500",
  includedMinutes: "5000",
  perMinuteRate: "0.18",
  retellApiKey: "",
  agentId: "",
};

export default function AdminPortal({
  initialTenants,
  healthReport,
  callLogsByTenant,
}: {
  initialTenants: TenantRow[];
  healthReport: AgentHealthReport;
  callLogsByTenant: Record<string, CallLog[]>;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");
  const [tenants, setTenants] = useState<TenantRow[]>(initialTenants);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Client Diagnostic Ledger — selected tenant id (null = not in diagnostic view)
  const [diagnosticTenantId, setDiagnosticTenantId] = useState<string | null>(null);

  // Edit modal state
  const [editing, setEditing] = useState<TenantRow | null>(null);
  const [editForm, setEditForm] = useState({
    clientName: "",
    allowedMinutes: "",
    perMinuteRate: "",
    retellApiKey: "",
    agentId: "",
    billingModel: "hybrid" as "hybrid" | "metered_maintenance" | "pure_per_minute",
    baseMonthlyFee: "",
    includedMinutes: "",
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // Offboard confirmation
  const [confirmDelete, setConfirmDelete] = useState<TenantRow | null>(null);

  // Lifecycle toggle in-flight guard (per tenant id)
  const [toggling, setToggling] = useState<string | null>(null);

  // Incoming webhook route URL + copy-to-clipboard state (Admin Overview).
  const [webhookUrl, setWebhookUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/webhooks/retell`);
    }
  }, []);
async function copyWebhook() {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable; ignore */
    }
  }

  function set<K extends keyof FormState>(key: K, value: string | "hybrid" | "metered_maintenance" | "pure_per_minute") {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email: form.email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create tenant");
        return;
      }
      // For hybrid: use includedMinutes as allowedMinutes; for others: use 0
      const allowedMins = form.billingModel === "hybrid" ? Number(form.includedMinutes) : 0;
      setTenants((prev) => [
        {
          id: data.id,
          clientName: data.clientName,
          username: data.username,
          allowedMinutes: allowedMins,
          usedMinutes: 0,
          perMinuteRate: Number(form.perMinuteRate),
          status: "active",
          hasRetellKey: Boolean(form.retellApiKey),
          agentId: form.agentId.trim(),
          billingModel: form.billingModel,
          baseMonthlyFee: Number(form.baseMonthlyFee),
          includedMinutes: Number(form.includedMinutes),
        },
        ...prev,
      ]);
      setSuccess(`Tenant "${data.clientName}" created. Login: ${data.username}`);
      setForm(EMPTY);
      setActiveTab("clients");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(t: TenantRow) {
    setEditing(t);
    setEditError(null);
    setEditForm({
      clientName: t.clientName,
      allowedMinutes: String(t.allowedMinutes),
      perMinuteRate: String(t.perMinuteRate),
      retellApiKey: "",
      agentId: t.agentId,
      billingModel: t.billingModel ?? "hybrid",
      baseMonthlyFee: String(t.baseMonthlyFee ?? 0),
      includedMinutes: String(t.includedMinutes ?? 0),
    });
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setEditError(null);
    setEditSaving(true);
    try {
      const payload: Record<string, unknown> = {
        clientName: editForm.clientName,
        allowedMinutes: Number(editForm.allowedMinutes),
        perMinuteRate: Number(editForm.perMinuteRate),
        agentId: editForm.agentId.trim(),
        billingModel: editForm.billingModel,
        baseMonthlyFee: Number(editForm.baseMonthlyFee),
        includedMinutes: Number(editForm.includedMinutes),
      };
      if (editForm.retellApiKey.trim()) payload.retellApiKey = editForm.retellApiKey.trim();
      const res = await fetch(`/api/admin/tenants/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error ?? "Failed to update tenant");
        return;
      }
      setTenants((prev) =>
        prev.map((t) =>
          t.id === editing.id
            ? {
                ...t,
                clientName: data.clientName,
                allowedMinutes: data.allowedMinutes,
                perMinuteRate: data.perMinuteRate,
                status: data.status,
                hasRetellKey: data.hasRetellKey,
                agentId: editForm.agentId.trim(),
                billingModel: data.billingModel ?? editForm.billingModel,
                baseMonthlyFee: data.baseMonthlyFee ?? Number(editForm.baseMonthlyFee),
                includedMinutes: data.includedMinutes ?? Number(editForm.includedMinutes),
              }
            : t
        )
      );
      setEditing(null);
      setSuccess(`Tenant "${data.clientName}" updated.`);
      router.refresh();
    } catch {
      setEditError("Network error");
    } finally {
      setEditSaving(false);
    }
  }

  // DYNAMIC LIFECYCLE CONTROLS — toggle Active/Suspended, persisted to repo.
  async function toggleStatus(t: TenantRow) {
    if (toggling) return;
    const next = t.status === "active" ? "suspended" : "active";
    setToggling(t.id);
    // Optimistic flip for instant visual feedback.
    setTenants((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: next } : x)));
    try {
      const res = await fetch(`/api/admin/tenants/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Roll back on failure.
        setTenants((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
        setError(data.error ?? "Failed to update status");
        return;
      }
      setTenants((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: data.status } : x)));
    } catch {
      setTenants((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
      setError("Network error");
    } finally {
      setToggling(null);
    }
  }

  async function confirmOffboard() {
    if (!confirmDelete) return;
    try {
      const res = await fetch(`/api/admin/tenants/${confirmDelete.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to offboard tenant");
        return;
      }
      setTenants((prev) => prev.filter((t) => t.id !== confirmDelete.id));
      setSuccess(`Tenant "${confirmDelete.clientName}" offboarded.`);
    } catch {
      setError("Network error");
    } finally {
      setConfirmDelete(null);
    }
  }

  const field = "bg-background-alt border border-border rounded-lg px-3 py-2.5 text-foreground outline-none focus:border-accent w-full transition";
  const label = "flex flex-col gap-1.5 text-sm text-muted";

  // ---- Aggregate call performance summary metrics (Overview tab) ----
  const totalAllowed = tenants.reduce((s, t) => s + t.allowedMinutes, 0);
  const totalUsed = tenants.reduce((s, t) => s + t.usedMinutes, 0);
  const activeCount = tenants.filter((t) => t.status === "active").length;
  const summaryMetrics = [
    { label: "Total Clients", value: String(tenants.length) },
    { label: "Active Accounts", value: String(activeCount) },
    { label: "Allocated Minutes", value: totalAllowed.toLocaleString() },
    { label: "Consumed Minutes", value: totalUsed.toLocaleString() },
  ];

  // Mobile nav items mirror the AdminSidebar tabs (reuse the same icons).
  const adminMobileItems = ADMIN_NAV.map((item) => ({
    key: item.id,
    label: item.label,
    icon: <item.icon className="w-4 h-4" />,
    active: activeTab === item.id,
    onClick: () => setActiveTab(item.id),
  }));

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  // Admin profile dropdown state (mirrors the client dashboard layout).
  const [adminUser, setAdminUser] = useState<SessionUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (active && d.user) setAdminUser(d.user);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar — desktop/tablet only (>= lg) */}
      <AdminSidebar active={activeTab} onSelect={setActiveTab} />

      {/* Main column */}
      <div className="flex-1 w-full flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6 border-b border-border bg-background-alt">
          <div className="flex items-center gap-3 min-w-0">
            <MobileNav
              brand={
                <>
                  <Logo className="h-7 w-auto text-accent" />
                  <span>Voicerely</span>
                </>
              }
              items={adminMobileItems}
            />
            <h1 className="text-base sm:text-lg font-semibold tracking-tight text-foreground truncate">
              Super-Admin Portal
            </h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />

            {/* Admin profile dropdown — same component as the client dashboard */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/15 text-accent">
                  <User className="w-4 h-4" />
                </span>
                <span className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-foreground text-xs font-medium truncate max-w-[140px]">
                    {adminUser?.clientName ?? "Admin"}
                  </span>
                  <span className="text-[11px] text-muted truncate max-w-[140px]">
                    @{adminUser?.username ?? "admin"}
                  </span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 hidden sm:block" />
              </button>

              {profileOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 z-50 bg-surface border border-border rounded-xl shadow-lg p-2"
                >
                  <div className="px-3 py-2.5 border-b border-border">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {adminUser?.clientName ?? "Admin"}
                    </p>
                    <p className="text-xs text-muted truncate">@{adminUser?.username}</p>
                  </div>
                  <div className="px-3 py-2.5 flex flex-col gap-2 text-sm">
                    <div className="flex items-center gap-2 text-muted">
                      <AtSign className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-foreground truncate">{adminUser?.username}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted">
                      <User className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-foreground truncate">{adminUser?.clientName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-foreground truncate">
                        {adminUser?.email || "No email on file"}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      onClick={logout}
                      role="menuitem"
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted hover:text-foreground hover:bg-background-alt rounded-lg transition"
                    >
                      <LogOut className="w-4 h-4" />
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          {activeTab === "overview" && (
            <div className="max-w-6xl mx-auto flex flex-col gap-8">
              {/* Aggregate call performance summary metrics */}
              <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {summaryMetrics.map((m) => (
                  <div key={m.label} className="bg-surface border border-border rounded-2xl p-5">
                    <p className="text-xs text-muted">{m.label}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{m.value}</p>
                  </div>
                ))}
              </section>

              {/* Automated agent health score analytics suite */}
              <AgentHealthPanel report={healthReport} />

              {/* Incoming webhook route — quick infrastructure pairing */}
              <section className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-accent" />
                  <h2 className="text-sm font-semibold text-foreground">Incoming Webhook Endpoint</h2>
                </div>
                <p className="text-xs text-muted">
                  Point your Retell AI account at this URL to stream call events into Voicerely.
                </p>
                <div className="flex items-stretch gap-2 mt-1">
                  <code className="flex-1 min-w-0 truncate rounded-lg bg-background-alt border border-border px-3 py-2 text-xs text-foreground tabular-nums">
                    {webhookUrl || "—"}
                  </code>
                  <button
                    type="button"
                    onClick={copyWebhook}
                    disabled={!webhookUrl}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground hover:border-accent hover:text-accent transition disabled:opacity-50"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </section>
            </div>
          )}

          {activeTab === "clients" && (
            <div className="max-w-6xl mx-auto">
              {diagnosticTenantId ? (
                (() => {
                  const dt = tenants.find((t) => t.id === diagnosticTenantId);
                  if (!dt) return null;
                  return (
                    <ClientDiagnosticView
                      clientName={dt.clientName}
                      username={dt.username}
                      agentId={dt.agentId}
                      logs={callLogsByTenant[dt.id] ?? []}
                      onBack={() => setDiagnosticTenantId(null)}
                    />
                  );
                })()
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <Users className="w-4 h-4 text-accent" />
                    <h2 className="text-lg font-semibold tracking-tight text-foreground">All Clients</h2>
                    <span className="ml-auto text-xs text-muted tabular-nums">{tenants.length} clients</span>
                  </div>
                  {tenants.length === 0 ? (
                    <p className="text-sm text-muted text-center bg-surface border border-border rounded-2xl py-10">
                      No tenants yet. Add one from the “Add Tenant” tab.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {tenants.map((t) => {
                        const consumedPct =
                          t.allowedMinutes > 0
                            ? Math.min(100, Math.round((t.usedMinutes / t.allowedMinutes) * 100))
                            : 0;
                        const isActive = t.status === "active";
                        return (
                          <article
                            key={t.id}
                            onClick={() => setDiagnosticTenantId(t.id)}
                            className="bg-surface border border-border rounded-2xl p-5 flex flex-col gap-4 cursor-pointer hover:border-accent/60 transition"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="text-foreground font-semibold truncate">{t.clientName}</h3>
                                <p className="text-xs text-muted tabular-nums truncate">@{t.username}</p>
                              </div>
                              <span
                                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                                  isActive ? "bg-accent/15 text-accent" : "bg-danger/15 text-danger"
                                }`}
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-accent" : "bg-danger"}`} />
                                {isActive ? "Active" : "Suspended"}
                              </span>
                            </div>

                            <dl className="grid grid-cols-2 gap-3 text-sm">
                              <div>
                                <dt className="text-xs text-muted">Minute Limit</dt>
                                <dd className="text-foreground tabular-nums">{t.allowedMinutes.toLocaleString()}</dd>
                              </div>
                              <div>
                                <dt className="text-xs text-muted">Markup Rate</dt>
                                <dd className="text-foreground tabular-nums">${t.perMinuteRate.toFixed(2)}/min</dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="text-xs text-muted">Markup Balance Consumed</dt>
                                <dd className="mt-1">
                                  <div className="flex items-center justify-between text-xs text-foreground tabular-nums">
                                    <span>{t.usedMinutes.toLocaleString()} min</span>
                                    <span className="text-muted">{consumedPct}%</span>
                                  </div>
                                  <div className="mt-1 h-1.5 w-full rounded-full bg-background-alt overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${isActive ? "bg-accent" : "bg-danger"}`}
                                      style={{ width: `${consumedPct}%` }}
                                    />
                                  </div>
                                </dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="text-xs text-muted">Retell Agent ID</dt>
                                <dd className="text-foreground text-xs truncate">
                                  {t.agentId ? (
                                    <span className="inline-flex items-center gap-1">
                                      <KeyRound className="w-3 h-3 text-accent" />
                                      {t.agentId}
                                    </span>
                                  ) : (
                                    <span className="text-muted">Not linked</span>
                                  )}
                                </dd>
                              </div>
                            </dl>

                            <div className="mt-auto flex items-center justify-between pt-2 border-t border-border">
                              <div className="flex items-center gap-2">
                                <StatusToggle
                                  status={t.status}
                                  disabled={toggling === t.id}
                                  onToggle={() => toggleStatus(t)}
                                  label={`Toggle ${t.clientName}`}
                                />
                                <span className="text-xs text-muted">{isActive ? "Active" : "Suspended"}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEdit(t);
                                  }}
                                  title="Edit package"
                                  className="p-1.5 rounded-md text-muted hover:text-foreground hover:bg-background-alt transition"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmDelete(t);
                                  }}
                                  title="Offboard"
                                  className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

{activeTab === "add" && (
            <div className="max-w-2xl mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <Plus className="w-4 h-4 text-accent" />
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Add Tenant</h2>
              </div>
              <section className="bg-surface border border-border rounded-2xl p-6">
                <form onSubmit={onSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className={`${label} sm:col-span-2`}>
                    Client Name
                    <input className={field} value={form.clientName} onChange={(e) => set("clientName", e.target.value)} required />
                  </div>
                  <div className={label}>
                    Login Username
                    <input className={field} value={form.username} onChange={(e) => set("username", e.target.value)} required />
                  </div>
                  <div className={label}>
                    Login Password
                    <input type="password" className={field} value={form.password} onChange={(e) => set("password", e.target.value)} required />
                  </div>
                  <div className={label}>
                    Client Email Address
                    <input type="email" className={field} value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="client@company.com" />
                    <span className="text-xs text-muted">Onboarding credentials are emailed here on creation.</span>
                  </div>
                   
                  {/* Billing Model Selector */}
                  <div className={`${label} sm:col-span-2`}>
                    Billing Model
                    <select 
                      className={field} 
                      value={form.billingModel} 
                      onChange={(e) => set("billingModel", e.target.value as "hybrid" | "metered_maintenance" | "pure_per_minute")}
                    >
                      <option value="hybrid">1. Custom Hybrid Plan (Base Fee + Included Minutes + Overage)</option>
                      <option value="metered_maintenance">2. Pure Metered + Flat Maintenance (Flat Monthly Fee + Per-Minute Usage)</option>
                      <option value="pure_per_minute">3. All-Inclusive Per-Minute (Pure usage rate with maintenance baked in)</option>
                    </select>
                  </div>

                  {/* Conditional fields based on billing model */}
                  {form.billingModel === "hybrid" && (
                    <>
                      <div className={label}>
                        Base Monthly Fee ($)
                        <input type="number" step="0.01" min="0" className={field} value={form.baseMonthlyFee} onChange={(e) => set("baseMonthlyFee", e.target.value)} required />
                      </div>
                      <div className={label}>
                        Included Minutes
                        <input type="number" min="0" className={field} value={form.includedMinutes} onChange={(e) => set("includedMinutes", e.target.value)} required />
                      </div>
                      <div className={label}>
                        Overage Rate ($)
                        <input type="number" step="0.01" min="0" className={field} value={form.perMinuteRate} onChange={(e) => set("perMinuteRate", e.target.value)} required />
                      </div>
                    </>
                  )}

                  {form.billingModel === "metered_maintenance" && (
                    <>
                      <div className={label}>
                        Base Monthly Fee ($)
                        <input type="number" step="0.01" min="0" className={field} value={form.baseMonthlyFee} onChange={(e) => set("baseMonthlyFee", e.target.value)} required />
                      </div>
                      <div className={label}>
                        Per-Minute Rate ($)
                        <input type="number" step="0.01" min="0" className={field} value={form.perMinuteRate} onChange={(e) => set("perMinuteRate", e.target.value)} required />
                      </div>
                    </>
                  )}

                  {form.billingModel === "pure_per_minute" && (
                    <div className={label}>
                      Per-Minute Rate ($)
                      <input type="number" step="0.01" min="0" className={field} value={form.perMinuteRate} onChange={(e) => set("perMinuteRate", e.target.value)} required />
                    </div>
                  )}

                  <div className={`${label} sm:col-span-2`}>
                    Primary Retell Agent ID
                    <input className={field} value={form.agentId} onChange={(e) => set("agentId", e.target.value)} placeholder="agent_..." />
                    <span className="text-xs text-muted">Links this tenant to its Retell agent for webhook attribution.</span>
                  </div>
                  <div className={`${label} sm:col-span-2`}>
                    Retell API Key
                    <input className={field} value={form.retellApiKey} onChange={(e) => set("retellApiKey", e.target.value)} placeholder="key_..." />
                    <span className="text-xs text-muted">Stored per-tenant. Leave blank to use demo data.</span>
                  </div>
                  {error && <p className="sm:col-span-2 text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}
                  {success && <p className="sm:col-span-2 text-sm text-accent bg-accent/10 border border-accent/30 rounded-lg px-3 py-2">{success}</p>}
                  <button
                    type="submit"
                    disabled={saving}
                    className="sm:col-span-2 flex items-center justify-center gap-2 bg-accent text-black font-semibold rounded-lg py-2.5 hover:opacity-90 transition disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    {saving ? "Creating…" : "Create Tenant"}
                  </button>
                </form>
              </section>
            </div>
          )}

          {activeTab === "billing" && (
            <div className="max-w-4xl mx-auto">
              <div className="flex items-center gap-2 mb-4">
                <Receipt className="w-4 h-4 text-accent" />
                <h2 className="text-lg font-semibold tracking-tight text-foreground">Global Billing</h2>
              </div>
              <section className="bg-surface border border-border rounded-2xl overflow-hidden">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border">
                  <div className="bg-surface p-5">
                    <p className="text-xs text-muted">Allocated Minutes</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{totalAllowed.toLocaleString()}</p>
                  </div>
                  <div className="bg-surface p-5">
                    <p className="text-xs text-muted">Consumed Minutes</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{totalUsed.toLocaleString()}</p>
                  </div>
                  <div className="bg-surface p-5">
                    <p className="text-xs text-muted">Active Clients</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{activeCount}</p>
                  </div>
                  <div className="bg-surface p-5">
                    <p className="text-xs text-muted">Avg Markup Rate</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                      ${tenants.length ? (tenants.reduce((s, t) => s + t.perMinuteRate, 0) / tenants.length).toFixed(2) : "0.00"}
                    </p>
                  </div>
                </div>
                {/* Desktop/tablet table */}
                <table className="hidden w-full text-sm sm:table">
                  <thead>
                    <tr className="text-left text-muted border-t border-border">
                      <th className="px-6 py-3 font-medium">Client</th>
                      <th className="px-6 py-3 font-medium text-right">Allowed</th>
                      <th className="px-6 py-3 font-medium text-right">Used</th>
                      <th className="px-6 py-3 font-medium text-right">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t) => (
                      <tr key={t.id} className="border-t border-border">
                        <td className="px-6 py-4 text-foreground">{t.clientName}</td>
                        <td className="px-6 py-4 text-right text-foreground tabular-nums">{t.allowedMinutes.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right text-foreground tabular-nums">{t.usedMinutes.toLocaleString()}</td>
                        <td className="px-6 py-4 text-right text-foreground tabular-nums">${t.perMinuteRate.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Mobile card list */}
                <ul className="sm:hidden divide-y divide-border">
                  {tenants.map((t) => (
                    <li key={t.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <span className="text-foreground font-medium truncate">{t.clientName}</span>
                      <span className="text-xs text-muted tabular-nums text-right shrink-0">
                        {t.usedMinutes.toLocaleString()}/{t.allowedMinutes.toLocaleString()} min · ${t.perMinuteRate.toFixed(2)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </main>
      </div>

      {/* Edit modal — custom package & metric update (global) */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold tracking-tight text-foreground">Edit {editing.clientName}</h3>
              <button onClick={() => setEditing(null)} className="text-muted hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={submitEdit} className="flex flex-col gap-4">
              <div className={label}>
                Client Name
                <input className={field} value={editForm.clientName} onChange={(e) => setEditForm((f) => ({ ...f, clientName: e.target.value }))} required />
              </div>
              <div className={label}>
                Allowed Minutes
                <input type="number" min="0" className={field} value={editForm.allowedMinutes} onChange={(e) => setEditForm((f) => ({ ...f, allowedMinutes: e.target.value }))} required />
              </div>
              <div className={label}>
                Per-Minute Rate ($)
                <input type="number" step="0.01" min="0" className={field} value={editForm.perMinuteRate} onChange={(e) => setEditForm((f) => ({ ...f, perMinuteRate: e.target.value }))} required />
              </div>
              <div className={label}>
                Billing Model
                <select
                  className={field}
                  value={editForm.billingModel}
                  onChange={(e) => setEditForm((f) => ({ ...f, billingModel: e.target.value as "hybrid" | "metered_maintenance" | "pure_per_minute" }))}
                >
                  <option value="hybrid">Hybrid (Base Fee + Included Minutes)</option>
                  <option value="metered_maintenance">Metered + Maintenance</option>
                  <option value="pure_per_minute">Pure Per-Minute</option>
                </select>
              </div>

              {editForm.billingModel === "hybrid" && (
                <>
                  <div className={label}>
                    Base Monthly Fee ($)
                    <input type="number" step="0.01" min="0" className={field} value={editForm.baseMonthlyFee} onChange={(e) => setEditForm((f) => ({ ...f, baseMonthlyFee: e.target.value }))} />
                  </div>
                  <div className={label}>
                    Included Minutes
                    <input type="number" min="0" className={field} value={editForm.includedMinutes} onChange={(e) => setEditForm((f) => ({ ...f, includedMinutes: e.target.value }))} />
                  </div>
                </>
              )}

              <div className={label}>
                Primary Retell Agent ID
                <input className={field} value={editForm.agentId} onChange={(e) => setEditForm((f) => ({ ...f, agentId: e.target.value }))} placeholder="agent_..." />
                <span className="text-xs text-muted">Re-links this tenant to its Retell agent.</span>
              </div>
              <div className={label}>
                New Retell API Key
                <input className={field} value={editForm.retellApiKey} onChange={(e) => setEditForm((f) => ({ ...f, retellApiKey: e.target.value }))} placeholder="key_... (leave blank to keep)" />
                <span className="text-xs text-muted">Re-encrypted at rest if provided.</span>
              </div>
              {editError && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{editError}</p>}
              <button
                type="submit"
                disabled={editSaving}
                className="flex items-center justify-center gap-2 bg-accent text-black font-semibold rounded-lg py-2.5 hover:opacity-90 transition disabled:opacity-50"
              >
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Offboard confirmation (global) */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setConfirmDelete(null)}>
          <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Offboard tenant?</h3>
            <p className="text-sm text-muted mt-2">
              This permanently removes <span className="text-foreground">{confirmDelete.clientName}</span> and their stored Retell key. This cannot be undone.
            </p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg py-2.5 border border-border text-muted hover:text-foreground transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmOffboard}
                className="flex-1 rounded-lg py-2.5 bg-danger text-foreground font-semibold hover:opacity-90 transition"
              >
                Offboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
