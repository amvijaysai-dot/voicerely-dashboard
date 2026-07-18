// components/ThemeProvider.tsx
//
// Light/Dark theme context. Toggles the `dark` class on <html> and persists
// the choice to localStorage. Avoids an extra dependency (next-themes) while
// staying compatible with Tailwind's `darkMode: "class"` strategy. The root
// <html> carries `suppressHydrationWarning` so the pre-paint script (in
// app/layout.tsx) can set the class before React hydrates.

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initial value is a best-effort guess; the pre-paint script in layout.tsx
  // has already set the real class, and we sync state on mount.
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setThemeState(isDark ? "dark" : "light");
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    try {
      localStorage.setItem("voicerely-theme", t);
    } catch {
      /* storage may be unavailable; ignore */
    }
  };

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
