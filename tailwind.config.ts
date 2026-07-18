import type { Config } from "tailwindcss";

/**
 * Voicerely design system — Tailwind v4 loads this via the `@config`
 * directive in app/globals.css. Color tokens mirror dashboard.md §1.1.
 */
const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "var(--background)", // Pitch Black (dark) / light surface
          alt: "var(--background-alt)", // Page background / secondary surface
        },
        surface: {
          DEFAULT: "var(--surface)", // Cards, table headers, panel borders
          hover: "var(--surface-hover)", // Hover state on interactive surfaces
        },
        accent: {
          DEFAULT: "#FF6B00", // Electric Amber — primary actions, highlights
          alt: "#FF7A00", // Gradient stop / accent hover
        },
        muted: "var(--muted)", // Body copy, labels, muted text
        border: "var(--border)", // Hairline dividers
        success: "#22C55E", // Completed call status
        danger: "#EF4444", // Failed call status
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Geist", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        glow: "0 0 24px 0 rgba(255,107,0,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;