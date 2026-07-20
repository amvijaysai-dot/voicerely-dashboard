// app/login/page.tsx
//
// Ultra-premium dual-theme login (Linear × Stripe). Light + dark, toggleable
// ON the login page itself, with Framer Motion. Visual + interaction polish ONLY.
// The authentication logic, API contract, routing, and session handling are
// UNCHANGED. The official Voicerely logo (components/Logo.tsx) is the single
// source of truth for branding.

"use client";

import { createContext, useContext, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence, useReducedMotion, type Variants } from "framer-motion";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Check,
  ShieldCheck,
  Shield,
  BarChart3,
  Clock,
  PhoneCall,
  Loader2,
  Sun,
  Moon,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { loginSchema } from "@/lib/validation";

type Theme = "light" | "dark";
const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "dark",
  toggle: () => {},
});
const useTheme = () => useContext(ThemeCtx);

const EASE = [0.16, 1, 0.3, 1] as const;

const headlineLines = ["Power Every Conversation.", "Drive Every", "Opportunity."];

const features = [
  { icon: PhoneCall, title: "24/7 AI RECEPTIONIST", desc: "Human-like voice, never miss a call." },
  { icon: Shield, title: "ENTERPRISE SECURITY", desc: "AES-256 encryption, SOC 2-ready." },
  { icon: BarChart3, title: "REAL-TIME ANALYTICS", desc: "Live call, sentiment & revenue." },
  { icon: Clock, title: "AFTER-HOURS CAPTURE", desc: "Convert off-hours into revenue." },
];

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`grid h-9 w-9 place-items-center rounded-full border transition-all duration-200 hover:scale-110 ${
        isDark
          ? "border-white/10 bg-white/10 text-white"
          : "border-stone-200 bg-stone-100 text-orange-500"
      }`}
    >
      <motion.span
        key={theme}
        initial={{ rotate: -180, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex"
      >
        {isDark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </motion.span>
    </button>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const setupSuccess = params.get("setup") === "1";
  const reduce = useReducedMotion();

  // ── Theme: read localStorage/OS once (lazy init), persist on change ──
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    const stored = localStorage.getItem("vr-theme");
    if (stored === "light" || stored === "dark") return stored;
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  });
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    localStorage.setItem("vr-theme", theme);
  }, [theme]);
  const [flash, setFlash] = useState(false);
  const toggle = () => {
    setFlash(true);
    setTheme((t) => (t === "dark" ? "light" : "dark"));
    window.setTimeout(() => setFlash(false), 400);
  };

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [shake, setShake] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);

    const parsed = loginSchema.safeParse({ username, password });
    if (!parsed.success) {
      const fieldErrors: { username?: string; password?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as "username" | "password";
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      setShake(true);
      window.setTimeout(() => setShake(false), 450);
      return;
    }
    setErrors({});

    setStatus("loading");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("idle");
        setServerError(data.error ?? "Login failed");
        setShake(true);
        window.setTimeout(() => setShake(false), 450);
        return;
      }
      setStatus("success");
      window.setTimeout(() => {
        router.push(data.isAdmin ? "/admin" : "/");
        router.refresh();
      }, 800);
    } catch (err) {
      setStatus("idle");
      const msg = err instanceof Error ? err.message : "Network error";
      setServerError(msg || "Network error");
      setShake(true);
      window.setTimeout(() => setShake(false), 450);
    }
  }

  // ── Framer Motion variants ──
  const page: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
  };
  const lineUp: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 30 },
    show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
  };
  const fade: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.6, delay: 0.6, ease: EASE } },
  };
  const cardItem: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 20, scale: reduce ? 1 : 0.95 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
  };
  const loginCard: Variants = {
    hidden: { opacity: 0, x: reduce ? 0 : 40, scale: reduce ? 1 : 0.98 },
    show: { opacity: 1, x: 0, scale: 1, transition: { duration: 0.7, delay: 0.4, ease: EASE } },
  };
  const field: Variants = {
    hidden: { opacity: 0, y: reduce ? 0 : 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
  };

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      <div
        className={`isolate min-h-screen w-full overflow-hidden bg-[#FAFAF9] text-stone-900 transition-colors duration-[400ms] dark:bg-[#050508] dark:text-white ${
          theme === "dark" ? "dark" : ""
        }`}
      >
        {/* Breathing gradient orbs (theme-aware via .dark overrides) */}
        <div className="vr-orb-b vr-orb-b--1" aria-hidden="true" />
        <div className="vr-orb-b vr-orb-b--2" aria-hidden="true" />
        <div className="vr-orb-b vr-orb-b--3" aria-hidden="true" />
        <div className="vr-orb-b vr-orb-b--4" aria-hidden="true" />
        {/* Noise grain — dark mode only */}
        <div
          className="vr-noise pointer-events-none fixed inset-0 z-0 dark:block hidden"
          aria-hidden="true"
        />
        {/* Brief overlay to mask the theme cross-fade */}
        <AnimatePresence>
          {flash && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-none fixed inset-0 z-50 bg-[#FAFAF9] dark:bg-[#050508]"
              aria-hidden="true"
            />
          )}
        </AnimatePresence>

        <div className="relative z-10 flex min-h-screen flex-col lg:flex-row">
          {/* ───────────────────────── LEFT HERO PANEL ───────────────────────── */}
          <motion.aside
            variants={page}
            initial="hidden"
            animate="show"
            className="relative hidden w-1/2 shrink-0 flex-col justify-between gap-10 p-8 xl:p-12 lg:flex"
          >
            <motion.div variants={lineUp} className="flex items-center gap-3">
              <Logo className="h-9 w-auto text-orange-600 dark:text-orange-500" />
              <span className="text-lg font-semibold tracking-tight text-stone-900 dark:text-white">
                Voicerely
              </span>
            </motion.div>

            <div className="max-w-xl">
              <motion.div variants={fade} className="relative inline-flex">
                <span
                  className="absolute -inset-3 -z-10 rounded-full bg-orange-500/5 blur-xl"
                  aria-hidden="true"
                />
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400">
                  AI Voice Agents Platform
                </span>
              </motion.div>

              <h1 className="mt-6 text-6xl font-extrabold leading-[0.9] tracking-tight text-stone-900 dark:text-white xl:text-7xl">
                {headlineLines.map((line, i) => (
                  <motion.span key={line} variants={lineUp} className="block">
                    {i === headlineLines.length - 1 ? (
                      <span
                        className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent dark:from-orange-400 dark:to-amber-300"
                        style={
                          theme === "dark"
                            ? { textShadow: "0 0 40px rgba(249,115,22,0.2)" }
                            : undefined
                        }
                      >
                        {line}
                      </span>
                    ) : (
                      line
                    )}
                  </motion.span>
                ))}
              </h1>

              <motion.p
                variants={fade}
                className="mt-6 max-w-md text-lg leading-relaxed text-stone-500 dark:text-stone-400"
              >
                Voicerely turns missed calls into booked revenue with human-like AI
                voice agents — available 24/7, fully secure, and measurable.
              </motion.p>

              <motion.div variants={page} className="mt-10 grid max-w-lg grid-cols-2 gap-4">
                {features.map((f) => (
                  <motion.div
                    key={f.title}
                    variants={cardItem}
                    whileHover={reduce ? undefined : { y: -6 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="rounded-2xl border p-5 transition-all duration-200 bg-white border-stone-200 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)] hover:border-stone-300 hover:shadow-[0_8px_24px_rgba(0,0,0,0.08)] dark:bg-white/[0.03] dark:border-white/[0.06] dark:shadow-none dark:hover:border-white/[0.12] dark:hover:shadow-[0_20px_50px_-28px_rgba(249,115,22,0.35)]"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-50 text-orange-500 ring-1 ring-orange-500/10 transition-colors duration-200 group-hover:bg-orange-100 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/20 dark:group-hover:bg-orange-500/20">
                      <f.icon className="h-7 w-7" />
                    </span>
                    <p className="mt-3 text-sm font-semibold uppercase tracking-wide text-stone-900 dark:text-white">
                      {f.title}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-stone-500">{f.desc}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            <motion.p
              variants={fade}
              className="absolute bottom-8 left-8 text-xs text-stone-400 dark:text-stone-600"
            >
              © 2026 Voicerely · Trusted by modern revenue teams
            </motion.p>
          </motion.aside>

          {/* ───────────────────────── RIGHT LOGIN CARD ───────────────────────── */}
          <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
            <motion.div
              variants={loginCard}
              initial="hidden"
              animate="show"
              className="w-full max-w-[420px]"
            >
              <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
                <Logo className="h-9 w-auto text-orange-600 dark:text-orange-500" />
                <span className="text-lg font-semibold tracking-tight text-stone-900 dark:text-white">
                  Voicerely
                </span>
              </div>

              <motion.div
                animate={reduce ? undefined : { scale: [1, 1.01, 1] }}
                key={theme}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className={`vr-grad-border vr-float rounded-3xl border p-10 backdrop-blur-2xl transition-all duration-[400ms] ${
                  shake ? "vr-shake" : ""
                } bg-white border-stone-200 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:bg-white/[0.04] dark:border-white/[0.08] dark:shadow-[0_0_80px_rgba(249,115,22,0.03)]`}
              >
                {/* Header row with theme toggle */}
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-stone-900 dark:text-white">
                      Welcome back
                    </h2>
                    <p className="mt-1 text-sm text-stone-500">Sign in to your Voicerely dashboard</p>
                  </div>
                  <ThemeToggle />
                </div>

                {setupSuccess && (
                  <motion.p
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-5 flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-400"
                  >
                    <ShieldCheck className="h-4 w-4 shrink-0" />
                    Password set successfully! You can now log in.
                  </motion.p>
                )}

                <motion.form
                  variants={page}
                  initial="hidden"
                  animate="show"
                  transition={{ delayChildren: 0.8, staggerChildren: 0.06 }}
                  onSubmit={onSubmit}
                  className="flex flex-col gap-5"
                  noValidate
                >
                  {/* Username */}
                  <motion.div variants={field} className="flex flex-col">
                    <label
                      htmlFor="username"
                      className="mb-2 text-sm font-medium text-stone-500 dark:text-stone-400"
                    >
                      Username
                    </label>
                    <div className="relative">
                      <User
                        className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-400 dark:text-stone-500"
                        aria-hidden="true"
                      />
                      <input
                        id="username"
                        name="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        autoComplete="username"
                        autoFocus
                        aria-invalid={!!errors.username}
                        aria-describedby={errors.username ? "username-err" : undefined}
                        className={`w-full rounded-xl border bg-stone-50 px-4 py-3.5 pl-10 text-stone-900 outline-none transition-all duration-[250ms] placeholder:text-stone-400 dark:bg-[#111118] dark:text-white dark:placeholder:text-stone-600 ${
                          errors.username
                            ? "border-red-500 focus:ring-2 focus:ring-red-500/50"
                        : "border-stone-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/30 dark:border-white/[0.08] dark:focus:border-orange-500/30"
                        }`}
                        placeholder="you@company.com"
                      />
                    </div>
                    {errors.username && (
                      <p id="username-err" className="mt-1.5 text-xs text-red-400">
                        {errors.username}
                      </p>
                    )}
                  </motion.div>

                  {/* Password */}
                  <motion.div variants={field} className="flex flex-col">
                    <label
                      htmlFor="password"
                      className="mb-2 text-sm font-medium text-stone-500 dark:text-stone-400"
                    >
                      Password
                    </label>
                    <div className="relative">
                      <Lock
                        className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-stone-400 dark:text-stone-500"
                        aria-hidden="true"
                      />
                      <input
                        id="password"
                        name="password"
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        aria-invalid={!!errors.password}
                        aria-describedby={errors.password ? "password-err" : undefined}
                        className={`w-full rounded-xl border bg-stone-50 px-4 py-3.5 pl-10 pr-10 text-stone-900 outline-none transition-all duration-[250ms] placeholder:text-stone-400 dark:bg-[#111118] dark:text-white dark:placeholder:text-stone-600 ${
                          errors.password
                            ? "border-red-500 focus:ring-2 focus:ring-red-500/50"
                        : "border-stone-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/30 dark:border-white/[0.08] dark:focus:border-orange-500/30"
                        }`}
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        aria-pressed={showPassword}
                        className="absolute right-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-stone-400 transition-colors duration-150 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                      >
                        <AnimatePresence mode="wait" initial={false}>
                          {showPassword ? (
                            <motion.span
                              key="eye"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="text-orange-500 dark:text-orange-400"
                            >
                              <Eye className="h-4 w-4" />
                            </motion.span>
                          ) : (
                            <motion.span
                              key="eyeoff"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.15 }}
                            >
                              <EyeOff className="h-4 w-4" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </button>
                    </div>
                    {errors.password && (
                      <p id="password-err" className="mt-1.5 text-xs text-red-400">
                        {errors.password}
                      </p>
                    )}
                  </motion.div>

                  {/* Remember me + Forgot password */}
                  <motion.div variants={field} className="flex items-center justify-between">
                    <label className="flex cursor-pointer items-center text-sm text-stone-500 dark:text-stone-400">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="vr-check2"
                      />
                      <span className="ml-2.5">Remember me</span>
                    </label>
                    <a
                      href="/set-password"
                      className="vr-underline-c text-sm font-medium text-orange-600 dark:text-orange-400"
                    >
                      Forgot password?
                    </a>
                  </motion.div>

                  <AnimatePresence>
                    {serverError && (
                      <motion.p
                        role="alert"
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400"
                      >
                        {serverError}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {/* Sign In CTA */}
                  <motion.button
                    variants={field}
                    type="submit"
                    disabled={status !== "idle"}
                    whileHover={reduce || status !== "idle" ? undefined : { scale: 1.02 }}
                    whileTap={reduce || status !== "idle" ? undefined : { scale: 0.97 }}
                    className={`group relative mt-1 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-4 text-base font-semibold tracking-wide text-white transition-all duration-200 ${
                      status === "success"
                        ? "bg-gradient-to-r from-green-500 to-green-600"
                        : "bg-gradient-to-r from-[#F97316] to-[#FBBF24] hover:shadow-[0_8px_30px_rgba(249,115,22,0.25)] dark:hover:shadow-[0_8px_30px_rgba(249,115,22,0.3)]"
                    } disabled:cursor-not-allowed`}
                    style={
                      status === "success"
                        ? { boxShadow: "0 8px 30px rgba(34,197,94,0.3)" }
                        : undefined
                    }
                  >
                    <span className="vr-shimmer-btn" aria-hidden="true" />
                    {status === "loading" ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : status === "success" ? (
                      <>
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 15 }}
                        >
                          <Check className="h-5 w-5" />
                        </motion.span>
                        Signed in
                      </>
                    ) : (
                      <>
                        Sign in
                        <ArrowRight className="h-[18px] w-[18px] transition-transform duration-200 group-hover:translate-x-0.5" />
                      </>
                    )}
                  </motion.button>
                </motion.form>

                <motion.p
                  variants={field}
                  initial="hidden"
                  animate="show"
                  transition={{ delay: 1 }}
                  className="mt-8 flex items-center justify-center gap-1.5 text-center text-xs text-stone-400 dark:text-stone-600"
                >
                  <Shield className="h-4 w-4 text-stone-500 dark:text-stone-500" />
                  Protected by Voicerely · Encrypted at rest and in transit
                </motion.p>
              </motion.div>
            </motion.div>
          </main>
        </div>
      </div>
    </ThemeCtx.Provider>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}