import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./_styles.css";

/*
 * /guides — homeowner SEO articles, isolated from the SaaS shell.
 *
 * Same isolation contract as /tools: page is added to PUBLIC_ROUTES in
 * app/auth-provider.tsx and HIDE_NAV_ROUTES in app/nav-bar.tsx so unauth
 * visitors aren't redirected and the SaaS NavBar doesn't render.
 *
 * No imports from outside /app/guides/ except next/link and shared types.
 */

export const metadata: Metadata = {
  title: {
    default: "Window Treatment Guides — honest advice for homeowners",
    template: "%s | Window Treatment Guides",
  },
  description:
    "Practical homeowner guides on choosing window treatments — written from real installer experience. No marketing, just what actually works.",
  alternates: { canonical: "/guides" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function GuidesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="guides-root flex-1">
      <Container>
        <header className="guides-chrome-header">
          <Link href="/guides" style={{ color: "var(--tool-text)" }}>
            Window Treatment Guides
          </Link>
        </header>

        <main>{children}</main>

        <footer className="guides-chrome-footer">
          Independent decision tools and guides for homeowners. We don&rsquo;t
          sell window treatments; we help you figure out what to look for
          before you do.
        </footer>
      </Container>
    </div>
  );
}

function Container({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[44rem] px-4 md:px-6">
      {children}
    </div>
  );
}
