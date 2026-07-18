// app/(admin)/AdminTopbar.tsx
"use client";

import { useRouter } from "next/navigation";
import { Mic, LogOut } from "lucide-react";

export default function AdminTopbar({ clientName }: { clientName: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-background-alt">
      <div className="flex items-center gap-2">
        <Mic className="w-5 h-5 text-accent" />
        <span className="font-semibold tracking-tight text-foreground">Voicerely</span>
        <span className="ml-2 text-xs uppercase tracking-wider text-accent">Super-Admin</span>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted">{clientName}</span>
        <button
          onClick={logout}
          className="flex items-center gap-1.5 text-muted hover:text-foreground transition"
        >
          <LogOut className="w-4 h-4" /> Log out
        </button>
      </div>
    </header>
  );
}
