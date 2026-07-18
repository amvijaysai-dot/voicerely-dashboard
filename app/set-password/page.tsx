// app/set-password/page.tsx
"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Mic, KeyRound } from "lucide-react";

function SetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const tenantId = params.get("tenant") ?? "";
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (!tenantId || !token) {
      setError("This setup link is incomplete. Request a new one.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not set password");
        return;
      }
      router.push("/login?setup=1");
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,107,0,0.08),transparent_55%)]" />
      <form
        onSubmit={onSubmit}
        className="relative w-full max-w-sm bg-surface border border-border rounded-2xl p-8 flex flex-col gap-5 shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <span className="grid place-items-center w-9 h-9 rounded-xl bg-accent/10 border border-accent/30">
            <Mic className="w-5 h-5 text-accent" />
          </span>
          <div>
            <p className="font-semibold tracking-tight text-foreground text-lg leading-none">Voicerely</p>
            <p className="text-xs text-muted mt-0.5">Set your password</p>
          </div>
        </div>

        <p className="text-sm text-muted">
          Choose a password for your dashboard account. This link can be used only once.
        </p>

        <label className="flex flex-col gap-1.5 text-sm text-muted">
          New password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="bg-background-alt border border-border rounded-lg px-3 py-2.5 text-foreground outline-none focus:border-accent transition"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm text-muted">
          Confirm password
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className="bg-background-alt border border-border rounded-lg px-3 py-2.5 text-foreground outline-none focus:border-accent transition"
          />
        </label>

        {error && (
          <p className="text-sm text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex items-center justify-center gap-2 bg-accent text-black font-semibold rounded-lg py-2.5 hover:opacity-90 transition disabled:opacity-50"
        >
          <KeyRound className="w-4 h-4" />
          {loading ? "Saving…" : "Set password"}
        </button>
      </form>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordForm />
    </Suspense>
  );
}
