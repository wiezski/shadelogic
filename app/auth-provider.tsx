"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "../lib/supabase";
import { resolvePermissions, type Permissions } from "../lib/permissions";
import { resolveFeatures, type Features } from "../lib/features";
import { registerDeviceSession, heartbeatSession, removeDeviceSession } from "../lib/device-session";
import type { User } from "@supabase/supabase-js";

// Routes that don't require authentication
const PUBLIC_ROUTES = ["/login", "/signup", "/onboarding", "/q/", "/intake", "/forgot-password", "/reset-password", "/i/", "/b/"];

export type TenantBranding = {
  slug: string | null;
  primaryColor: string | null;
  primaryHover: string | null;
  darkColor: string | null;
  font: string | null;
  logoUrl: string | null;
  logoMark: string | null;
};

const DEFAULT_BRANDING: TenantBranding = {
  slug: null, primaryColor: null, primaryHover: null,
  darkColor: null, font: null, logoUrl: null, logoMark: null,
};

type AuthContextType = {
  user: User | null;
  companyId: string | null;
  role: string;
  permissions: Permissions;
  features: Features;
  plan: string;
  branding: TenantBranding;
  hiddenNav: string[];
  businessType: string | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const DEFAULT_PERMS = resolvePermissions("owner");
const DEFAULT_FEATURES = resolveFeatures("trial");

const AuthContext = createContext<AuthContextType>({
  user: null, companyId: null, role: "owner", permissions: DEFAULT_PERMS,
  features: DEFAULT_FEATURES, plan: "trial", branding: DEFAULT_BRANDING,
  hiddenNav: [], businessType: null,
  loading: true, signOut: async () => {},
});

export function useAuth() { return useContext(AuthContext); }

/** Inject white-label CSS variables onto <html> */
function applyBranding(b: TenantBranding) {
  const html = document.documentElement;

  if (b.slug) {
    html.setAttribute("data-tenant", b.slug);
  } else {
    html.removeAttribute("data-tenant");
  }

  // Set --tenant-* CSS custom properties that get picked up by [data-tenant] rule
  const vars: Record<string, string | null> = {
    "--tenant-primary":       b.primaryColor,
    "--tenant-primary-hover": b.primaryHover,
    "--tenant-dark":          b.darkColor,
    "--tenant-font":          b.font ? `'${b.font}', sans-serif` : null,
  };

  for (const [prop, val] of Object.entries(vars)) {
    if (val) {
      html.style.setProperty(prop, val);
    } else {
      html.style.removeProperty(prop);
    }
  }

  // Load custom Google Font if specified
  if (b.font && b.font !== "Figtree") {
    const linkId = "tenant-font-link";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(b.font)}:wght@400;500;600;700;800;900&display=swap`;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,        setUser]        = useState<User | null>(null);
  const [companyId,   setCompanyId]   = useState<string | null>(null);
  const [role,        setRole]        = useState<string>("owner");
  const [permissions, setPermissions] = useState<Permissions>(DEFAULT_PERMS);
  const [features,    setFeatures]    = useState<Features>(DEFAULT_FEATURES);
  const [plan,        setPlan]        = useState<string>("trial");
  const [branding,    setBranding]    = useState<TenantBranding>(DEFAULT_BRANDING);
  const [hiddenNav,   setHiddenNav]   = useState<string[]>([]);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [profileStatus, setProfileStatus] = useState<string>("active");
  const router   = useRouter();
  const pathname = usePathname();

  const isPublic = pathname === "/" || PUBLIC_ROUTES.some(r => pathname.startsWith(r));

  async function loadProfile(uid: string) {
    const { data } = await supabase
      .from("profiles").select("company_id, role, permissions, status").eq("id", uid).single();
    setCompanyId(data?.company_id ?? null);
    setProfileStatus(data?.status ?? "active");
    const r = data?.role ?? "owner";
    setRole(r);
    setPermissions(resolvePermissions(r, data?.permissions ?? {}));

    // Load company features + branding
    if (data?.company_id) {
      const { data: company } = await supabase
        .from("companies")
        .select("plan, features, business_type, hidden_nav, brand_slug, brand_primary_color, brand_primary_hover, brand_dark_color, brand_font, brand_logo_url, brand_logo_mark")
        .eq("id", data.company_id).single();
      setPlan(company?.plan ?? "trial");
      setFeatures(resolveFeatures(company?.plan ?? "trial", company?.features ?? {}));
      setHiddenNav(Array.isArray(company?.hidden_nav) ? company.hidden_nav : []);
      setBusinessType(company?.business_type ?? null);

      // Only apply custom branding if the plan has the white_label feature.
      // A former-Business downgrader with brand_* columns still in their row
      // should NOT keep seeing their custom colors on a Starter/Pro plan.
      const resolvedFeatures = resolveFeatures(company?.plan ?? "trial", company?.features ?? {});
      const b: TenantBranding = resolvedFeatures.white_label
        ? {
            slug:         company?.brand_slug ?? null,
            primaryColor: company?.brand_primary_color ?? null,
            primaryHover: company?.brand_primary_hover ?? null,
            darkColor:    company?.brand_dark_color ?? null,
            font:         company?.brand_font ?? null,
            logoUrl:      company?.brand_logo_url ?? null,
            logoMark:     company?.brand_logo_mark ?? null,
          }
        : DEFAULT_BRANDING;
      setBranding(b);
      applyBranding(b);

      // Register device session (max 3 per user, kicks oldest if over)
      registerDeviceSession(uid, data.company_id).catch(console.error);
    } else {
      // Default to trial if no company
      setPlan("trial");
      setFeatures(resolveFeatures("trial"));
      setHiddenNav([]);
      setBusinessType(null);
      setBranding(DEFAULT_BRANDING);
      applyBranding(DEFAULT_BRANDING);
    }
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
      else {
        setCompanyId(null);
        setBranding(DEFAULT_BRANDING);
        applyBranding(DEFAULT_BRANDING);
      }
    });

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line

  // Heartbeat: keep device session alive every 5 minutes
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      heartbeatSession(user.id).catch(console.error);
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  // Redirect to login when not authenticated
  useEffect(() => {
    if (!loading && !user && !isPublic) {
      router.replace("/login");
    }
  }, [loading, user, isPublic]); // eslint-disable-line

  async function signOut() {
    // Remove device session before signing out
    if (user) {
      await removeDeviceSession(user.id).catch(console.error);
    }
    await supabase.auth.signOut();
    applyBranding(DEFAULT_BRANDING);
    router.replace("/login");
  }

  // Show loading spinner while checking session
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--zr-black)" }}>
        <div style={{ color: "var(--zr-text-muted)", fontSize: "14px" }}>Loading...</div>
      </div>
    );
  }

  // Don't render protected content if not logged in
  if (!user && !isPublic) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--zr-black)" }}>
        <div style={{ color: "var(--zr-text-muted)", fontSize: "14px" }}>Redirecting...</div>
      </div>
    );
  }

  // Block pending users from accessing the app
  if (user && profileStatus === "pending" && !isPublic) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: "var(--zr-black)" }}>
        <div className="w-full max-w-md text-center space-y-4">
          <div className="text-4xl">⏳</div>
          <h1 className="text-xl font-bold" style={{ color: "var(--zr-text-primary)" }}>Account Pending Approval</h1>
          <p className="text-sm" style={{ color: "var(--zr-text-secondary)" }}>
            Your account is waiting for the team owner to approve your access. This is because the team has reached its plan's user limit.
          </p>
          <p className="text-sm" style={{ color: "var(--zr-text-muted)" }}>
            Once approved, this page will refresh automatically and you'll have full access.
          </p>
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              onClick={() => loadProfile(user.id)}
              className="rounded px-4 py-2 text-sm font-medium"
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}>
              Check Again
            </button>
            <button
              onClick={signOut}
              className="rounded px-4 py-2 text-sm font-medium"
              style={{ color: "var(--zr-error)" }}>
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, companyId, role, permissions, features, plan, branding, hiddenNav, businessType, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
