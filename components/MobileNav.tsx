// components/MobileNav.tsx
//
// Animated mobile navigation drawer. Shown below `lg` (1024px) in place of the
// fixed sidebar. A hamburger button toggles an overlay that slides in from the
// left. Closes on navigation, on backdrop click, and on Escape.

"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";

interface MobileNavProps {
  brand?: ReactNode;
  items: { key: string; label: string; icon: ReactNode; active: boolean; onClick: () => void }[];
  headerRight?: ReactNode;
}

export function MobileNav({ brand, items, headerRight }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Top-bar hamburger (mobile only) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition hover:bg-surface-hover"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Overlay + drawer */}
      <div
        className={`fixed inset-0 z-50 lg:hidden ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />
        {/* Drawer panel */}
        <nav
          className={`absolute left-0 top-0 h-full w-72 max-w-[80%] bg-background-alt border-r border-border shadow-xl flex flex-col transition-transform duration-300 ease-out ${
            open ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex items-center justify-between h-16 px-5 border-b border-border">
            <div className="flex items-center gap-2 text-foreground font-semibold tracking-tight">
              {brand}
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-surface-hover transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex flex-col py-3">
            {items.map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
                className={`flex items-center gap-3 px-5 py-3 text-sm text-left transition-colors border-l-2 ${
                  item.active
                    ? "border-accent text-foreground bg-surface/60"
                    : "border-transparent text-muted hover:text-foreground hover:bg-surface/40"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
          {headerRight && <div className="mt-auto border-t border-border p-4">{headerRight}</div>}
        </nav>
      </div>
    </>
  );
}
