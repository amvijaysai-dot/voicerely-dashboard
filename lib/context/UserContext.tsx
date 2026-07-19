"use client";

import { createContext, useContext } from "react";

export interface SessionUser {
  id: string;
  username: string;
  clientName: string;
  email?: string;
  isAdmin: boolean;
}

const UserContext = createContext<SessionUser | null>(null);

export function UserProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

/** Hook to access the current session user in any Client Component.
 *  Only works inside DashboardShell (which wraps all dashboard pages). */
export function useUser(): SessionUser {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside DashboardShell");
  return ctx;
}