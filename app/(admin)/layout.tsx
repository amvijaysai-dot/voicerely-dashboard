// app/(admin)/layout.tsx
//
// Super-Admin shell. Server component: redirects to /login if there is no
// valid session, and to / if the user is not an admin. The visual chrome
// (header, mobile nav, theme toggle) lives in the client AdminPortal.

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!session.isAdmin) redirect("/");

  return <>{children}</>;
}
