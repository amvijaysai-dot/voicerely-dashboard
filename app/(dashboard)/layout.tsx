// app/(dashboard)/layout.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LucideIcon, LayoutDashboard, PhoneCall, Receipt, LogOut, BarChart3, Bot, User, Mail, AtSign, ChevronDown, Settings } from "lucide-react";
import { MobileNav } from "@/components/MobileNav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/metrics", label: "Metrics", icon: BarChart3 },
  { href: "/calls", label: "Live Logs", icon: PhoneCall },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/billing", label: "Billing", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavItem({ href, label, icon: Icon }: { href: string; label: string; icon: LucideIcon }) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 px-6 py-3 text-sm border-l-2 transition-colors ${
        active
          ? "bg-accent text-black font-medium border-accent"
          : "border-transparent text-muted hover:text-foreground hover:bg-surface/40"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </Link>
  );
}

interface SessionUser {
  id: string;
  username: string;
  clientName: string;
  email?: string;
  isAdmin: boolean;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<SessionUser | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Load the logged-in user's profile (username, client name, email).
  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        if (active && d.user) setUser(d.user);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Close the profile dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Route protection is enforced at the edge by middleware.ts. This layout
  // only renders for authenticated users, so it just provides the shell.
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const mobileItems = NAV.map((item) => ({
    key: item.href,
    label: item.label,
    icon: <item.icon className="w-4 h-4" />,
    active: item.href === "/" ? pathname === "/" : pathname.startsWith(item.href),
    onClick: () => router.push(item.href),
  }));

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar — desktop/tablet only (>= lg) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-background-alt">
        <div className="flex items-center gap-2 px-6 h-16 border-b border-border">
          <Logo className="h-8 w-auto text-accent" />
          <span className="font-semibold tracking-tight text-foreground">Voicerely</span>
        </div>
        <nav className="flex flex-col py-4">
          {NAV.map((item) => (
            <NavItem key={item.href} {...item} />
          ))}
        </nav>
      </aside>

      {/* Main column */}
      <div className="flex-1 w-full flex flex-col min-w-0">
        {/* Topbar */}
        <header className="h-16 flex items-center justify-between gap-3 px-4 sm:px-6 border-b border-border bg-background-alt">
          <div className="flex items-center gap-3 min-w-0">
            <MobileNav
              brand={
                <>
                  <Logo className="h-7 w-auto text-accent" />
                  <span>Voicerely</span>
                </>
              }
              items={mobileItems}
            />
            <div className="hidden lg:block text-sm text-muted truncate">Analytics Dashboard</div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeToggle />

            {/* Client profile dropdown — shows username, client name, email */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-2 text-sm text-muted hover:text-foreground transition"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-accent/15 text-accent">
                  <User className="w-4 h-4" />
                </span>
                <span className="hidden sm:flex flex-col items-start leading-tight">
                  <span className="text-foreground text-xs font-medium truncate max-w-[140px]">
                    {user?.clientName ?? "Client"}
                  </span>
                  <span className="text-[11px] text-muted truncate max-w-[140px]">
                    @{user?.username ?? "—"}
                  </span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 hidden sm:block" />
              </button>

                  {profileOpen && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 z-50 bg-surface border border-border rounded-xl shadow-lg p-2"
                >
                  <div className="px-3 py-2.5 border-b border-border">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {user?.clientName ?? "Client"}
                    </p>
                    <p className="text-xs text-muted truncate">@{user?.username}</p>
                  </div>
                  <div className="px-3 py-2.5 flex flex-col gap-2 text-sm">
                    <div className="flex items-center gap-2 text-muted">
                      <AtSign className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-foreground truncate">{user?.username}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted">
                      <User className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-foreground truncate">{user?.clientName}</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-foreground truncate">
                        {user?.email || "No email on file"}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-border mt-1 pt-1">
                    <button
                      onClick={logout}
                      role="menuitem"
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-muted hover:text-foreground hover:bg-background-alt rounded-lg transition"
                    >
                      <LogOut className="w-4 h-4" />
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 bg-background">{children}</main>
      </div>
    </div>
  );
}