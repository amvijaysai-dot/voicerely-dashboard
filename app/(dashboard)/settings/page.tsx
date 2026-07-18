// app/(dashboard)/settings/page.tsx
"use client";

import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

export default function SettingsPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (next.length < 8) { setError("New password must be at least 8 characters"); return; }
    if (next !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Failed to change password"); return; }
      setSuccess(true);
      setCurrent(""); setNext(""); setConfirm("");
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted mt-1">Manage your account security.</p>
      </div>

      <section className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <KeyRound className="w-4 h-4 text-accent" />
          <h2 className="text-foreground font-semibold">Change Password</h2>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {["Current password", "New password", "Confirm new password"].map((label, i) => {
            const val = [current, next, confirm][i];
            const setter = [setCurrent, setNext, setConfirm][i];
            return (
              <label key={label} className="flex flex-col gap-1.5 text-sm text-muted">
                {label}
                <input
                  type="password"
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  autoComplete={i === 0 ? "current-password" : "new-password"}
                  className="bg-background-alt border border-border rounded-lg px-3 py-2.5 text-foreground outline-none focus:border-accent transition"
                />
              </label>
            );
          })}
          {error && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>}
          {success && (
            <p className="text-sm text-success bg-success/10 border border-success/30 rounded-lg px-3 py-2 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Password changed successfully.
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 bg-accent text-black font-semibold rounded-lg py-2.5 hover:opacity-90 transition disabled:opacity-50"
          >
            {loading ? "Saving…" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}