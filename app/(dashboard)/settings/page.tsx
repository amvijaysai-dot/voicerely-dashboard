// app/(dashboard)/settings/page.tsx
"use client";

import { useState, useEffect } from "react";
import { KeyRound, ShieldCheck, CircleDollarSign } from "lucide-react";

export default function SettingsPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Business Profile state
  const [bookingValue, setBookingValue] = useState<string>("");
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Load current booking value on mount
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (d.user?.avgBookingValue) setBookingValue(String(d.user.avgBookingValue));
      })
      .catch(() => {});
  }, []);

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

  async function handleBookingSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBookingError(null);
    setBookingSuccess(false);
    const val = parseFloat(bookingValue);
    if (isNaN(val) || val <= 0) { setBookingError("Enter a valid dollar amount"); return; }
    setBookingLoading(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avgBookingValue: val }),
      });
      const data = await res.json();
      if (!res.ok) { setBookingError(data.error ?? "Failed to save"); return; }
      setBookingSuccess(true);
    } catch { setBookingError("Network error"); }
    finally { setBookingLoading(false); }
  }

  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted mt-1">Manage your account security and business profile.</p>
      </div>

      {/* Business Profile Section - NEW */}
      <section className="bg-surface border border-border rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-5">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF6B00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>
          </svg>
          <h2 className="text-foreground font-semibold">Business Profile</h2>
        </div>
        <p className="text-sm text-muted mb-4">Used to calculate your Revenue Recovered metric on the Overview dashboard.</p>
        <form onSubmit={handleBookingSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm text-muted">
            Average Booking Value (USD)
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
              <input
                type="number"
                min="1"
                step="1"
                value={bookingValue}
                onChange={(e) => setBookingValue(e.target.value)}
                placeholder="210"
                className="w-full pl-7 pr-4 bg-background-alt border border-border rounded-lg px-3 py-2.5 text-foreground outline-none focus:border-accent transition"
              />
            </div>
            <span className="text-xs text-muted">Average revenue per appointment or service call at your business.</span>
          </label>
          {bookingError && <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{bookingError}</p>}
          {bookingSuccess && <p className="text-sm text-success bg-success/10 border border-success/30 rounded-lg px-3 py-2">✓ Saved successfully</p>}
          <button type="submit" disabled={bookingLoading} className="flex items-center justify-center gap-2 bg-accent text-black font-semibold rounded-lg py-2.5 hover:opacity-90 transition disabled:opacity-50 max-w-xs">
            {bookingLoading ? "Saving…" : "Save Profile"}
          </button>
        </form>
      </section>

      {/* Change Password Section */}
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