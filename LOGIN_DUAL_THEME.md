# Login — Dual-Theme Cinematic Redesign

**Role:** Principal Frontend Engineer (top-tier SaaS)
**Scope:** `app/login/page.tsx` + `app/globals.css` (dark-immersive layer)
**Date:** 2026-07-21
**Verification:** `npx tsc --noEmit` ✅ 0 errors · `npx eslint app/login/page.tsx` ✅ 0 errors/warnings

This pass implements the **dark immersive login** experience (Stripe / Apple feel)
with a sophisticated dual-theme direction. The outer dashboard shell keeps its
existing light/warm theme; the login page is a focused, cinematic dark takeover.
**100% of the authentication logic, API calls, routing, and session handling are
unchanged.** The official `Logo` component remains the single source of truth.

---

## 1. Dark Immersive Login (`.vr-login`)

- **Full dark takeover:** `#0A0A0F` deep charcoal with warm undertones, `isolation: isolate`
  so orbs/noise never bleed into the shell. No light shell UI is visible on `/login`.
- **Floating gradient orbs:** three `.vr-orb` blobs (orange/amber at 8–12% opacity),
  blurred 70px, drifting on a 20s `vr-orb-drift` keyframe with staggered delays for
  organic, non-repeating motion.
- **Noise texture:** `.vr-noise` inline-SVG fractal noise at 3% opacity, `pointer-events-none`.
- **Page entrance:** `vr-fade-in` (opacity) for a graceful cinematic reveal.

## 2. Hero Section (Left Panel)

- **Headline** "Power Every Conversation. Drive Every Opportunity." at `text-5xl`
  (`xl:text-6xl`), `font-extrabold` (800), `leading-[1.05]`, `tracking-tight`.
- **Staggered word reveal:** each word wrapped in `.vr-word` with `vr-word-in`
  (fade + slide-up + blur-clear), 0.08s incremental delay — word-by-word entrance.
- **"Opportunity."** uses `.vr-grad-text` — orange→amber gradient clip with a soft
  orange glow (`text-shadow`).
- **Subheadline:** `text-lg`, `max-w-md`, `text-gray-400`, fades in after the headline.

## 3. Bento Feature Grid (2×2)

- Glassmorphism cards `.vr-bento`: `bg-white/5`, `backdrop-blur(20px) saturate(140%)`,
  `border-white/10`, `rounded-2xl`, inner highlight + layered shadow.
- Each card: icon in a `rounded-xl` `bg-orange-500/10` chip (`text-orange-400`,
  `ring-1 ring-orange-500/20`), `uppercase tracking-wide` white title, `text-gray-400` desc.
- **Hover:** `translateY(-4px)`, border brightens to `white/20`, orange-tinted shadow.
- **Entrance:** staggered `vr-rise` (0.08s between cards, starting at 0.4s).

## 4. Login Card (Right Panel)

- `.vr-bento` + **`.vr-float`** gentle oscillation (6px, 4s, infinite) for a living feel.
- `rounded-3xl`, generous `p-8 sm:p-10`.
- "Welcome back" `text-2xl font-bold text-white`; sub "Sign in to your Voicerely
  dashboard" `text-sm text-gray-400 mb-6`.

### Form elements
- **Username / Password:** `.vr-input-dark` (`#1A1A1F` bg, `border-white/10`,
  `rounded-xl`, `px-4 py-3`), left-aligned `User`/`Lock` icons in `gray-500`,
  placeholder `you@company.com` in `gray-600`. Focus → orange-500 ring-2 + orange glow spread.
- **Eye toggle:** `gray-500` → `orange-400` on hover, smooth opacity/color transition.
- **"Forgot password?":** `orange-400` with `.vr-underline` (center-expanding underline on hover).
- **Remember me:** custom `.vr-check` checkbox — orange-500 when checked, spring
  (`cubic-bezier(0.34,1.56,0.64,1)`) toggle animation, `focus-visible` ring.
- **Sign In CTA:** full gradient `from-orange-500 to-amber-500`, `rounded-xl`,
  `py-3.5`, `font-semibold`; hover `scale(1.02)` + brighter orange glow + shimmer
  sweep (`.vr-shimmer`); active `scale(0.98)`; loading spinner; ripple (`.vr-ripple`).
- **Social row:** "Or continue with" with horizontal hairlines; Google (`Globe`) &
  Microsoft (`Mail`) ghost buttons (`bg-white/5`, `border-white/10`), hover lift.
- **Footer:** "Protected by Voicerely" + shield icon, `text-gray-600`, centered.

## 5. Animation & Performance

- All motion uses **transform/opacity only** (compositor-friendly, 60fps target).
- Orbs, float, word-reveal, rise, shimmer, ripple, checkbox spring — every keyframe
  is GPU-accelerated.
- **`prefers-reduced-motion`** disables all animations and hover transforms.

## 6. Accessibility (WCAG 2.1 AA)

- Native `<label htmlFor>` for every input; `aria-invalid` on error; `role="alert"`
  error message; password toggle is a real `<button>` with `aria-label` + `aria-pressed`.
- Custom checkbox keeps full keyboard support + `focus-visible` outline.
- Decorative orbs/noise are `aria-hidden`; the `Logo` SVG carries `role="img" aria-label`.
- Color contrast: white/gray-400 text on `#0A0A0F` meets AA; orange used for accents only.

## 7. Responsiveness

- **Desktop (≥1024px):** split 45% hero / 55% card.
- **Tablet/mobile:** hero panel hidden, centered card; mobile brand lockup shown;
  no horizontal scroll at 320/375/390px.

---

## Deliberately Unchanged (verified)

- **Auth logic:** `onSubmit` → `fetch("/api/auth/login", POST)` with same
  `{ username, password }`; success `router.push(data.isAdmin ? "/admin" : "/")` +
  `router.refresh()`; identical error + network-failure handling.
- **Validation / API / routes:** server-side Zod `loginSchema` unchanged; `setup=1`
  banner preserved; no new endpoints.
- **Session handling:** cookie-based, middleware-enforced — untouched.
- **Components:** only `Logo` (reused) + existing `lucide-react` icons; no new deps.
- **Design tokens:** the existing `tailwind.config.ts` / `globals.css` light theme is
  preserved for the dashboard shell; the login uses its own scoped dark utilities.

> Note: The spec mentioned Framer Motion / next-themes. To honor the earlier
> "no unnecessary libraries / reuse existing components" constraint and keep the
> bundle lean, the animation system is implemented with CSS keyframes (transform/
> opacity only) which meets the same 60fps and reduced-motion requirements without
> a runtime dependency. The dashboard shell light theme and its components were not
> modified in this pass — only the login page was elevated to the cinematic dark mode.