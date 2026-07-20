// app/login/page.tsx
//
// Premium enterprise SaaS login experience (Linear / Vercel / Stripe-style).
// UI-only redesign: the authentication logic, form submission, validation,
// routing, and session handling are UNCHANGED from the original implementation.
// The official Voicerely logo (components/Logo.tsx) is reused as the single
// source of truth for branding — identical to the dashboard header.

"use client";

import { useState, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, ShieldCheck, User, Lock, Eye, EyeOff, Check } from "lucide-react";
import { Logo } from "@/components/Logo";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const setupSuccess = params.get("setup") === "1";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      router.push(data.isAdmin ? "/admin" : "/");
      router.refresh();
    } catch (err) {
      // Network-level failure (server unreachable, CORS, etc.)
      const msg = err instanceof Error ? err.message : "Network error";
      setError(msg || "Network error");
    } finally {
      setLoading(false);
    }
  }

  // Button ripple micro-interaction (pointer-driven, no layout shift).
  function spawnRipple(e: React.MouseEvent<HTMLButtonElement>) {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const span = document.createElement("span");
    span.className = "vr-ripple";
    span.style.width = span.style.height = `${size}px`;
    span.style.left = `${e.clientX - rect.left - size / 2}px`;
    span.style.top = `${e.clientY - rect.top - size / 2}px`;
    btn.appendChild(span);
    window.setTimeout(() => span.remove(), 600);
  }

  const features = [
    "24/7 AI Receptionist",
    "Enterprise Security",
    "Real-time Analytics",
  ];

  return (
    <div className="vr-auth-bg vr-fade-in relative min-h-screen w-full overflow-hidden text-foreground">
      {/* Subtle noise texture overlay */}
      <div className="vr-noise pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
        {/* ───────────────────────── LEFT BRANDING PANEL (45%) ───────────────────────── */}
        <aside className="relative hidden w-[45%] shrink-0 overflow-hidden border-r border-border bg-background-alt lg:flex">
          {/* Animated gradient mesh + soft orange glow */}
          <div className="vr-brand-mesh pointer-events-none absolute inset-0" aria-hidden="true" />
          {/* Minimal floating particles */}
          <span className="vr-particle h-24 w-24 left-[12%] top-[18%]" aria-hidden="true" />
          <span
            className="vr-particle h-16 w-16 right-[14%] top-[40%]"
            style={{ animationDelay: "1.5s" }}
            aria-hidden="true"
          />
          <span
            className="vr-particle h-20 w-20 left-[22%] bottom-[16%]"
            style={{ animationDelay: "3s" }}
            aria-hidden="true"
          />

          <div className="relative z-10 flex w-full flex-col justify-between p-10 xl:p-14">
            {/* Brand row */}
            <div className="flex items-center gap-3">
              <Logo className="h-9 w-auto text-accent" />
              <span className="text-lg font-semibold tracking-tight text-foreground">
                Voicerely
              </span>
            </div>

            {/* Hero copy */}
            <div className="max-w-md">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                AI Voice Agents Platform
              </span>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-foreground xl:text-5xl">
                Power Every Conversation.
                <br />
                Drive Every{" "}
                <span className="text-accent">Opportunity.</span>
              </h1>
              <p className="mt-5 text-base leading-relaxed text-muted">
                Voicerely turns missed calls into booked revenue with human-like
                AI voice agents — available 24/7, fully secure, and measurable.
              </p>

              {/* Premium feature cards */}
              <ul className="mt-8 flex flex-col gap-3">
                {features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface/60 px-4 py-3 backdrop-blur-sm"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <span className="text-sm font-medium text-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Very subtle waveform decoration */}
            <div className="flex h-12 items-end gap-1.5 opacity-70" aria-hidden="true">
              {[0.4, 0.7, 1, 0.55, 0.85, 0.45, 0.95, 0.6, 0.8, 0.5, 0.9, 0.65].map(
                (h, i) => (
                  <span
                    key={i}
                    className="vr-waveform w-1.5 rounded-full bg-accent"
                    style={{
                      height: `${h * 100}%`,
                      animationDelay: `${i * 0.12}s`,
                    }}
                  />
                )
              )}
            </div>
          </div>
        </aside>

        {/* ───────────────────────── RIGHT AUTH CARD (55%) ───────────────────────── */}
        <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <div className="vr-card-in w-full max-w-md">
            {/* Mobile-only brand (hidden on lg where the panel shows it) */}
            <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
              <Logo className="h-8 w-auto text-accent" />
              <span className="text-lg font-semibold tracking-tight text-foreground">
                Voicerely
              </span>
            </div>

            <div className="rounded-2xl border border-border bg-surface/70 p-7 shadow-2xl backdrop-blur-xl sm:p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Welcome back
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Sign in to your Voicerely dashboard
                </p>
              </div>

              {setupSuccess && (
                <p className="mb-5 flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  Password set successfully! You can now log in.
                </p>
              )}

              <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
                {/* Username */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="username"
                    className="text-sm font-medium text-muted"
                  >
                    Username
                  </label>
                  <div className="group relative">
                    <User
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-colors group-focus-within:text-accent"
                      aria-hidden="true"
                    />
                    <input
                      id="username"
                      name="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      autoComplete="username"
                      autoFocus
                      aria-invalid={!!error}
                      className="w-full rounded-lg border border-border bg-background-alt py-2.5 pl-10 pr-3 text-foreground outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
                      placeholder="you@company.com"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="password"
                      className="text-sm font-medium text-muted"
                    >
                      Password
                    </label>
                    <a
                      href="/set-password"
                      className="text-xs text-accent transition hover:underline"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="group relative">
                    <Lock
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-colors group-focus-within:text-accent"
                      aria-hidden="true"
                    />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      aria-invalid={!!error}
                      className="w-full rounded-lg border border-border bg-background-alt py-2.5 pl-10 pr-10 text-foreground outline-none transition placeholder:text-muted/60 focus:border-accent focus:ring-2 focus:ring-accent/30"
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:text-foreground"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Error state */}
                {error && (
                  <p
                    role="alert"
                    className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
                  >
                    {error}
                  </p>
                )}

                {/* CTA */}
                <button
                  ref={btnRef}
                  type="submit"
                  disabled={loading}
                  onClick={spawnRipple}
                  className="relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-gradient-to-r from-accent to-accent-alt py-2.5 font-semibold text-black shadow-glow transition duration-150 hover:opacity-95 hover:shadow-lg active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      Sign in
                    </>
                  )}
                </button>
              </form>
            </div>

            <p className="mt-6 text-center text-xs text-muted">
              Protected by Voicerely · Your data is encrypted at rest and in transit
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}