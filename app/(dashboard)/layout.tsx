// app/(dashboard)/layout.tsx
// Server Component — reads the session server-side, passes user to DashboardShell.
// No "use client" — this is intentionally a Server Component.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { DashboardShell } from "@/components/DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Session is already verified by middleware — but we still read it here
  // to pass the user data to DashboardShell without a client-side fetch.
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const user = {
    id: session.id,
    username: session.username,
    clientName: session.clientName,
    email: session.email,
    isAdmin: session.isAdmin,
  };

  return <DashboardShell user={user}>{children}</DashboardShell>;
}