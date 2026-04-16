"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import { resolvePermissions, type Permissions } from "../lib/permissions";
import type { User } from "@supabase/supabase-js";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/signup", "/q/", "/intake"];

type AuthContextType = {
  user: User | null;
  companyId: string | null;
  role: string;
  permissions: Permissions;
  loading: boolean;
  signOut: () => Promise<void>;
};

const DEFAULT_PERMS = resolvePermissions("owner");

const AuthContext = createContext<AuthContextType>({
  user: null, companyId: null, role: "owner", permissions: DEFAULT_PERMS, loading: true, signOut: async () => {},
});

export function useAuth() { return useContext(AuthContext); }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,        setUser]        = useState<User | null>(null);
  const [companyId,   setCompanyId]   = useState<string | null>(null);
  const [role,        setRole]        = useState<string>("owner");
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMS);
  const [loading,     setLoading]     = useState(true);
  const router   = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));

  async function loadProfile(uid: string) {
    const { data } = await supabase
      .from("profiles").select("company_id, role, permissions").eq("id", uid).single();
    setCompanyId(data?.company_id ?? null);
    const r = data?.role ?? "owner";
    setRole(r);
    setPermissions(resolvePermissions(r, data?.permissions ?? {}));
  }

  useEffect(() => {
    // Check existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      setLoading(false);
    });

    // Listen for auth changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else { setCompanyId(null); }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line

  // Redirect to login when not authenticated
  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace("/login");
    }
  }, [loading, user, isPublic]); // eslint-disable-line

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  // Show loading spinner while checking session
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-400 text-sm">Loading…</div>
      </div>
    );
  }

  // Don't render protected content if not logged in
  if (!user && !isPublic) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-400 text-sm">Redirecting…</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, companyId, role, permissions, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
