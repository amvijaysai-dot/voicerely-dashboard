# Login — Light/Dark Mode Fix (Critical Bug Resolved)

**Role:** Senior Frontend Engineer
**Scope:** `app/login/page.tsx` + `app/globals.css`
**Date:** 2026-07-21
**Verification:** `npx tsc --noEmit` ✅ 0 errors · `npx eslint app/login/page.tsx` ✅ 0 errors/warnings

## The Bug
The previous iteration kept the `vr-void` class on the login root, which hard-coded
`background-color: #050508`. As a result, toggling to light mode only flipped the
login card to white while the **entire page background, hero text, and orbs stayed
black** — the headline ("Power Every Conversation. Drive Every") was effectively
invisible on black in light mode. This was a half-broken theme switch.

## Root Cause
- Root element used `.vr-void { background-color: #050508 }` unconditionally.
- Several elements had conflicting/duplicated Tailwind classes (e.g. the badge had
  both `bg-orange-500/10` and `bg-orange-50` in the same string), so light styles
  were overridden by dark ones.
- The custom checkbox (`.vr-check2`) was dark-only (white border + `#111118` bg).

## Fixes Applied (every element now has both dark + light)

**FIX 1 — Full page background switches**
- Root: removed `vr-void`; now `bg-[#FAFAF9] text-stone-900 dark:bg-[#050508] dark:text-white`
  with `transition-colors duration-[400ms]`. The ENTIRE page (not just the card) switches.

**FIX 2 — Headline text color**
- `text-stone-900 dark:text-white`. "Opportunity." gradient is `from-orange-500 to-amber-500`
  (light) / `from-orange-400 to-amber-300` (dark). `text-shadow` glow applied **only** in
  dark via inline style (`theme === "dark"`).

**FIX 3 — Logo & brand**
- Wordmark `text-stone-900 dark:text-white`; logo icon `text-orange-600 dark:text-orange-500`
  (both desktop + mobile lockups).
- Badge: light `bg-orange-50 border-orange-200 text-orange-600`; dark `bg-orange-500/10
  border-orange-500/20 text-orange-400`. (Removed the duplicate conflicting classes.)

**FIX 4 — Subheadline**
- `text-stone-500 dark:text-stone-400`.

**FIX 5 — Feature cards (light upgrade)**
- Light: `bg-white border-stone-200 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.02)]`
  hover `border-stone-300` + `shadow-[0_8px_24px_rgba(0,0,0,0.08)]`; icon chip `bg-orange-50
  text-orange-500`; title `text-stone-900`; desc `text-stone-500`. Dark variants preserved.

**FIX 6 — Footer text**
- `text-stone-400 dark:text-stone-600`.

**FIX 7 — Orbs (light)**
- Light orbs already softer (3–6%) via `.vr-orb-b--*` base; dark deepens to 6–10% via
  `.dark .vr-orb-b--*`. They still drift but are barely visible in light.

**FIX 8 — Noise grain**
- `dark:block hidden` — shown only in dark; fully removed in light (clean/airy).

**FIX 9 — Inputs (light)**
- `bg-stone-50 border-stone-200 placeholder:text-stone-400`; focus `border-orange-400
  ring-orange-500/30`; icons `text-stone-400`. Dark unchanged.

**FIX 10 — Theme toggle**
- Dark: `bg-white/10 border-white/10` + Moon white. Light: `bg-stone-100 border-stone-200`
  + Sun orange-500. 180° rotate + crossfade on toggle (Framer Motion).

**Additional polish**
- Login card light: `shadow-[0_4px_24px_rgba(0,0,0,0.06)] border-stone-200` (warm, not harsh);
  `transition-all duration-[400ms]` for smooth cross-fade.
- Checkbox `.vr-check2`: light `bg-stone-100 border-stone-300`, checked `bg-orange-500`;
  dark overrides restored via `.dark .vr-check2`. Spring on check preserved.
- Sign In CTA: same orange→amber gradient both themes; light hover shadow softened to
  `rgba(249,115,22,0.25)` (dark `0.3`).
- **Smooth transition mask:** a brief full-screen overlay (`AnimatePresence`, 0.2s fade)
  flashes on toggle to mask the cross-fade — no jarring flashes.

## Verification
- `npx tsc --noEmit` → 0 errors.
- `npx eslint app/login/page.tsx` → 0 errors / 0 warnings.
- Every text element now has a readable color in BOTH modes (contrast: stone-900/stone-500
  on #FAFAF9; white/stone-400 on #050508).

## Unchanged (critical)
- **Auth logic / API / routes / session:** identical `fetch("/api/auth/login", POST)`,
  `isAdmin` redirect, `setup=1` banner, `Suspense` wrapper — untouched.
- **Components:** only `Logo` (reused) + `lucide-react` icons; `framer-motion` is the sole dependency.
- **Dashboard shell:** not modified.