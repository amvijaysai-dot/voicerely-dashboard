# Login — Dual-Theme (Light + Dark) with On-Page Toggle

**Role:** Principal Frontend Engineer — production React + TS + Tailwind + Framer Motion
**Scope:** `app/login/page.tsx` + `app/globals.css` (theme-aware orbs)
**Date:** 2026-07-21
**Verification:** `npx tsc --noEmit` ✅ 0 errors · `npx eslint app/login/page.tsx` ✅ 0 errors/warnings

This pass adds a **fully functional light/dark theme toggle directly on the login
page** (no post-login switching only). Both themes are premium: dark is cinematic
and deep, light is airy and refined. **100% of the authentication logic, API
contract, routing, and session handling are unchanged.** The official `Logo`
component remains the single source of truth.

---

## 1. Theme System
- **Strategy:** Tailwind `darkMode: "class"` (already configured). The login root
  element carries the `dark` class when `theme === "dark"`; all `dark:` variants then
  apply. Light is the default base layer.
- **State:** local `ThemeCtx` context (`light` | `dark`). Initialized lazily from
  `localStorage` (`vr-theme`), falling back to `prefers-color-scheme` on first visit.
  Persisted to `localStorage` on every change. Applied to `document.documentElement`
  via a single persistence `useEffect` (no setState-in-effect anti-pattern).
- **Transition:** `transition-colors duration-[400ms]` on the root so all colors
  cross-fade smoothly; the card does a subtle `scale [1 → 1.01 → 1]` pulse on toggle.

## 2. Dark Mode (default)
- Void `#050508` (`.vr-void`), never pure black; warm undertones, `isolation: isolate`.
- 4 breathing orbs (`.vr-orb-b`): orange `#F97316` @ 6–10%, amber `#FBBF24` @ 4–8%,
  blurred 80px, 25s scale-breathing drift.
- Noise grain (`.vr-noise`, 3%) shown **only in dark** (`dark:block hidden`).
- Cards `bg-white/[0.04]`, `border-white/[0.08]`; inputs `bg-[#111118]`; headings white, body `stone-400`; focus orange glow.

## 3. Light Mode
- Warm off-white `#FAFAF9` base; **no noise grain** (clean, airy).
- Orbs softer/diffused (orange 3–6%, amber 3–5%) via `.dark` overrides in CSS.
- Cards `bg-white`, `border-stone-200`, `shadow-lg` (warm); inputs `bg-stone-50`,
  `border-stone-200`; headings `stone-900`, body `stone-500`; focus orange ring.

## 4. Theme Toggle (inside card header, top-right)
- 36×36 `rounded-full` button. Dark: `bg-white/10` + `Moon` white. Light: `bg-stone-100` + `Sun` orange-500.
- Hover `scale(1.1)` + brighten. Icon crossfades + rotates 180° on toggle (Framer Motion).
- `aria-label` announces the target mode.

## 5. Left Hero Panel (theme-aware)
- Logo + "Voicerely" wordmark; badge "AI Voice Agents Platform" (dark: orange-500/10 + orange-400; light: orange-50 + orange-600) with soft glow.
- Headline 3 staggered lines (`text-6xl xl:text-7xl`, `font-extrabold`, `leading-[0.9]`); "Opportunity." gradient (dark orange-400→amber-300 + glow; light orange-500→amber-500).
- Subheadline + 2×2 bento grid (icon 28px in 44×44 chip; dark orange-500/10, light orange-50; hover lift -6px, brighten, deepen shadow).
- Footer bottom-left.

## 6. Right Login Card
- `max-w-[420px]`, `rounded-3xl p-10`, floating oscillation (8px, 5s). Dark: glass + orange ambient glow; Light: white + warm `shadow-lg`.
- Header "Welcome back" + sub, with the theme toggle inline.
- **Form (username + password only):** theme-aware inputs, left `User`/`Lock` icons, focus orange ring/glow; `Eye`/`EyeOff` crossfade toggle; custom `.vr-check2` checkbox (orange when checked, spring); "Forgot password?" center-expand underline.
- **Sign In CTA:** same gradient both themes, `ArrowRight` slide, hover scale + glow + shimmer sweep, loading spinner, success green morph + auto-redirect 0.8s.
- **No social login / "Or continue with"** — removed per spec.
- Security footer.

## 7. Animations (Framer Motion)
- Page-load sequence via `Variants` + `staggerChildren`: orbs → logo → badge → headline
  lines (y 30→0, 0.8s, `cubic-bezier(0.16,1,0.3,1)`) → subheadline (0.6s) → bento (0.8s) →
  login card (x 40→0, 0.4s) → form fields (0.06s, 0.8s).
- Theme toggle: 0.4s color cross-fade + card scale pulse + icon rotate/fade.
- Reduced motion: `useReducedMotion()` disables translate/scale; CSS keyframes gated by `prefers-reduced-motion`.

## 8. Validation (fully functional)
- Client-side `loginSchema` (zod) mirrors the server: username/password required;
  field errors render under inputs; invalid submit triggers `vr-shake`. On success the
  **exact same** `fetch("/api/auth/login", POST)` + `router.push(data.isAdmin ? "/admin" : "/")` + `router.refresh()` runs.

## 9. Responsive
- Desktop 50/50; tablet/mobile stacked, centered card, mobile brand lockup; no horizontal scroll at 320/375/390px.

## 10. Accessibility (WCAG 2.1 AA)
- Native `<label htmlFor>`; `aria-invalid` + `aria-describedby`; `role="alert"` errors;
  password toggle real `<button>` with `aria-label`/`aria-pressed`; toggle `aria-label`;
  custom checkbox keyboard + `focus-visible`; decorative orbs/noise `aria-hidden`; `Logo` `role="img" aria-label`.

---

## Deliberately Unchanged (verified)
- **Auth logic / API / routes:** `POST /api/auth/login`, `{ username, password }`, `isAdmin` redirect, `setup=1` banner — byte-for-byte preserved.
- **Session handling:** cookie-based, middleware-enforced — untouched.
- **Components:** only `Logo` (reused) + `lucide-react` icons; `framer-motion` is the sole dependency (required by spec).
- **Dashboard shell:** not modified; only the login page gained the dual-theme toggle.