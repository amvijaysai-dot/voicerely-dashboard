// components/admin/AdminSidebar.tsx
//
// Left-hand administration navigation. Mirrors the client dashboard sidebar
// style (Voicerely dark palette). Drives the active-tab state in AdminPortal
// via the onSelect callback; the active item is highlighted with the accent
// left-border treatment.

import { LucideIcon, LayoutDashboard, Users, UserPlus, Receipt } from "lucide-react";
import Image from "next/image";

export type AdminTab = "overview" | "clients" | "add" | "billing";

export interface NavItem {
  id: AdminTab;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_NAV: NavItem[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "clients", label: "All Clients", icon: Users },
  { id: "add", label: "Add Tenant", icon: UserPlus },
  { id: "billing", label: "Global Billing", icon: Receipt },
];

export function AdminSidebar({
  active,
  onSelect,
  className = "",
}: {
  active: AdminTab;
  onSelect: (tab: AdminTab) => void;
  className?: string;
}) {
  return (
    <aside
      className={`hidden lg:flex w-64 shrink-0 flex-col border-r border-border bg-background-alt ${className}`}
    >
      <div className="flex items-center gap-2 px-6 h-16 border-b border-border">
        <Image src="/logo.png" alt="Voicerely Logo" width={40} height={40} className="object-contain" />
        <span className="font-semibold tracking-tight text-foreground">Voicerely</span>
        <span className="ml-1 text-xs uppercase tracking-wider text-accent">Admin</span>
      </div>
      <nav className="flex flex-col py-4" role="listbox" aria-label="Select tenant">
        {ADMIN_NAV.map(({ id, label, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              role="option"
              aria-selected={isActive}
              onClick={() => onSelect(id)}
              className={`flex items-center gap-3 px-6 py-3 text-sm border-l-2 text-left transition-colors ${
                isActive
                  ? "border-accent text-foreground bg-surface/40"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
