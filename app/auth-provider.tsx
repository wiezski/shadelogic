"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import type { User } from "@supabase/supabase-js";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/signup", "/q/", "/intake"];

type AuthContextType = {
  user: User | null;
  companyId: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null, companyId: null, loading: true, signOut: async () => {},
});

export function useAuth() { return useContext(AuthContext); }

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUser]      = useState<User | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading,   setLoading]   = useState(true);
  const router   = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));

  async function loadProfile(uid: string) {
    const { data } = await supabase
      .from("profiles").select("company_id").eq("id", uid).single();
    setCompanyId(data?.company_id ?? null);
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
    <AuthContext.Provider value={{ user, companyId, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
