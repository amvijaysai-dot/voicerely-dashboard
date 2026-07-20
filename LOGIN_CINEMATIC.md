# Login — Ultra-Premium Cinematic Redesign (Linear × Stripe)

**Role:** Principal Frontend Engineer — premium SaaS auth flows
**Scope:** `app/login/page.tsx` + `app/globals.css` (void-black layer) + `package.json` (framer-motion)
**Date:** 2026-07-21
**Verification:** `npx tsc --noEmit` ✅ 0 errors · `npx eslint app/login/page.tsx` ✅ 0 errors/warnings

This pass rebuilds the login as an **ultra-premium, cinematic, focused** experience
(Linear meets Stripe — dark, confident, $50k/yr feel). **No social login** — username
and password only. **100% of the authentication logic, API contract, routing, and
session handling are unchanged.** The official `Logo` component remains the single
source of truth.

---

## 1. Visual Foundation
- **Void black** `#050508` (`.vr-void`), never pure black; warm undertones, `isolation: isolate`.
- **4 breathing gradient orbs** (`.vr-orb-b`): orange `#F97316` @ 6–10%, amber `#FBBF24` @ 4–8%,
  blurred 80px, 25s `vr-orb-breathe` (scale 0.95→1.05) with staggered delays for organic drift.
- **Noise grain:** `.vr-noise` inline-SVG fractal noise at 3% opacity, `fixed inset-0`, `pointer-events-none`.

## 2. Left Hero Panel
- **Brand:** `Logo` (orange-500) + "Voicerely" wordmark, top-left, `p-8 xl:p-12`.
- **Badge:** "AI Voice Agents Platform" pill — `bg-orange-500/10`, `border-orange-500/20`,
  `text-orange-400`, `text-xs`, with a soft `bg-orange-500/5 blur-xl` glow behind it.
- **Headline** (3 staggered lines, `text-6xl xl:text-7xl`, `font-extrabold`, `leading-[0.95]`):
  "Power Every Conversation." / "Drive Every" / "Opportunity." — last line is an
  orange-400→amber-300 gradient with `text-shadow` glow.
- **Subheadline:** `text-lg`, `text-stone-400`, `max-w-md`, `leading-relaxed`.
- **Bento 2×2:** `bg-white/[0.03]`, `backdrop-blur-xl`, `border-white/[0.06]`, `rounded-2xl`, `p-5`;
  40×40 `rounded-xl bg-orange-500/10` icon chip (`text-orange-400`); uppercase title; `text-stone-500` desc.
  Hover: `translateY(-6px)`, brighter border, orange shadow, icon chip brightens.
- **Footer:** "© 2026 Voicerely · Trusted by modern revenue teams" — `text-stone-600`, `text-xs`, bottom-left.

## 3. Right Login Card
- `max-w-[420px]`, `bg-white/[0.04]`, `backdrop-blur-2xl`, `rounded-3xl` (24px), `p-10`.
- **Gradient hairline border** (`.vr-grad-border`, top brighter) + barely-perceptible
  `box-shadow: 0 0 80px rgba(249,115,22,0.03)` orange ambient glow.
- **Floating:** `.vr-float` translateY oscillation (8px, 5s, ease-in-out infinite).
- **Header:** "Welcome back" `text-2xl font-bold text-white`; "Sign in to your Voicerely dashboard" `text-stone-500`.

### Form (username + password only)
- **Username / Password:** `bg-[#111118]`, `border-white/[0.08]`, `rounded-xl`, `px-4 py-3.5`,
  left `User`/`Lock` icon (`text-stone-500`); focus → `ring-2 ring-orange-500/50` + orange glow spread;
  `transition-all 250ms cubic-bezier(0.4,0,0.2,1)`.
- **Eye toggle:** `EyeOff` default (`text-stone-500` → hover `text-stone-300`), `Eye` active
  (`text-orange-400`); smooth 0.15s crossfade via `AnimatePresence`.
- **Remember me:** custom `.vr-check2` checkbox (orange-500 when checked, white checkmark, spring scale).
- **Forgot password?:** `text-orange-400` with `.vr-underline-c` center-expanding underline on hover.
- **Sign In CTA:** full-width `py-4`, gradient `135deg #F97316 → #FBBF24`, `ArrowRight` icon
  (`group-hover:translate-x-0.5`); hover `scale(1.02)` + orange glow + continuous shimmer sweep
  (`.vr-shimmer-btn`); active `scale(0.97)`; **loading** spinner; **success** morphs to green
  gradient with spring `Check` + "Signed in", auto-redirect after 0.8s.
- **No social row / "Or continue with"** — removed entirely per spec.
- **Security footer:** `Shield` + "Protected by Voicerely · Encrypted at rest and in transit".

## 4. Animations (Framer Motion)
- **Page-load sequence** implemented with `Variants` + `staggerChildren`:
  orbs fade → logo slideY → badge scale → headline lines (y 30→0, 0.8s, `cubic-bezier(0.16,1,0.3,1)`) →
  subheadline (delay 0.6s) → bento cards (scale 0.95→1, spring hover) → login card (x 40→0, delay 0.4s) →
  form fields (stagger 0.06s, delay 0.8s).
- **Error state:** card `vr-shake` (x shake) + red border/glow on invalid fields; server error `role="alert"`.
- **Reduced motion:** `useReducedMotion()` disables translate/scale; CSS keyframes gated by `prefers-reduced-motion`.

## 5. Form Validation (fully functional)
- Client-side `loginSchema` (zod, from `@/lib/validation`) mirrors the server contract:
  username required, password required. Field-level errors render under each input; invalid submit triggers shake.
- On success the **exact same** `fetch("/api/auth/login", POST)` + `router.push(data.isAdmin ? "/admin" : "/")` + `router.refresh()` flow runs. Network failures show the same message.

## 6. Responsive
- **Desktop (≥1024px):** 50/50 split (hero + card).
- **Tablet/mobile:** hero hidden, centered card (`max-w-[420px]`), mobile brand lockup; no horizontal scroll at 320/375/390px.

## 7. Accessibility (WCAG 2.1 AA)
- Native `<label htmlFor>`; `aria-invalid` + `aria-describedby` on inputs; `role="alert"` errors;
  password toggle is a real `<button>` with `aria-label` + `aria-pressed`; custom checkbox keeps keyboard + `focus-visible`;
  decorative orbs/noise `aria-hidden`; `Logo` carries `role="img" aria-label`.

---

## Deliberately Unchanged (verified)
- **Auth logic / API / routes:** `POST /api/auth/login`, `{ username, password }` body, `isAdmin` redirect, `setup=1` banner — byte-for-byte preserved.
- **Session handling:** cookie-based, middleware-enforced — untouched.
- **Components:** only `Logo` (reused) + `lucide-react` icons; `framer-motion` added as the sole new dependency (explicitly required by spec).
- **Dashboard shell:** not modified; only the login page was elevated.

> Note: The spec recommended `react-hook-form` + `zod`. To keep the change minimal and avoid
> restructuring, validation uses the existing `loginSchema` (zod) with native controlled inputs —
> functionally equivalent, fully validated, and zero new form-library surface area. The dashboard
> light theme and its components were intentionally left intact so the dual-theme contrast holds.