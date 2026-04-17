"use client";

// Public builder portal page — no login required.
// Access via unique token URL: yourdomain.com/b/[portalToken]

import { useEffect, useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { ZRLogo } from "../../zr-logo";

type BuilderContact = {
  id: string;
  company_id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  status: string;
  created_at: string;
};

type BuilderProject = {
  id: string;
  company_id: string;
  builder_id: string;
  name: string;
  address: string | null;
  status: "bid_requested" | "quoted" | "approved" | "in_progress" | "completed" | "canceled";
  notes: string | null;
  created_at: string;
};

type QuoteReference = {
  id: string;
  quote_id: string;
};

type Message = {
  id: string;
  sender: "company" | "builder";
  message: string;
  created_at: string;
};

type CompanyInfo = {
  name: string;
  brand_logo_url: string | null;
  brand_primary_color: string | null;
};

const STATUS_COLORS = {
  bid_requested: { bg: "#ede9fe", text: "#7c3aed", label: "Bid Requested" },
  quoted: { bg: "#dbeafe", text: "#2563eb", label: "Quoted" },
  approved: { bg: "#dcfce7", text: "#16a34a", label: "Approved" },
  in_progress: { bg: "#fef3c7", text: "#d97706", label: "In Progress" },
  completed: { bg: "#d1fae5", text: "#059669", label: "Completed" },
  canceled: { bg: "#fee2e2", text: "#dc2626", label: "Canceled" },
};

export default function BuilderPortalPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm" style={{ color: "var(--zr-text-secondary)" }}>Loading portal…</div>}>
      <BuilderPortalInner />
    </Suspense>
  );
}

function BuilderPortalInner() {
  const { token } = useParams() as { token: string };

  const [builder, setBuilder] = useState<BuilderContact | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [projects, setProjects] = useState<BuilderProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [projectQuotes, setProjectQuotes] = useState<Record<string, QuoteReference[]>>({});
  const [projectMessages, setProjectMessages] = useState<Record<string, Message[]>>({});
  const [messageText, setMessageText] = useState<Record<string, string>>({});
  const [sendingSaveId, setSendingSaveId] = useState<string | null>(null);

  useEffect(() => {
    if (token) load();
  }, [token]);

  async function load() {
    // Find builder by portal_token
    const { data: builderData, error: builderError } = await supabase
      .from("builder_contacts")
      .select("id, company_id, company_name, contact_name, email, phone, notes, status, created_at")
      .eq("portal_token", token)
      .single();

    if (builderError || !builderData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setBuilder(builderData as BuilderContact);

    // Load company info
    const { data: companyData } = await supabase
      .from("companies")
      .select("name, brand_logo_url, brand_primary_color")
      .eq("id", builderData.company_id)
      .single();

    if (companyData) {
      setCompany(companyData as CompanyInfo);
    }

    // Load projects for this builder
    const { data: projectsData } = await supabase
      .from("builder_projects")
      .select("id, company_id, builder_id, name, address, status, notes, created_at")
      .eq("builder_id", builderData.id)
      .order("created_at", { ascending: false });

    const projectsList = (projectsData || []) as BuilderProject[];
    setProjects(projectsList);

    // Preload quotes for all projects
    const quotesMap: Record<string, QuoteReference[]> = {};
    for (const proj of projectsList) {
      const { data: quotesData } = await supabase
        .from("builder_project_quotes")
        .select("id, quote_id")
        .eq("project_id", proj.id);
      quotesMap[proj.id] = (quotesData || []) as QuoteReference[];
    }
    setProjectQuotes(quotesMap);

    // Preload messages for all projects
    const messagesMap: Record<string, Message[]> = {};
    for (const proj of projectsList) {
      const { data: messagesData } = await supabase
        .from("builder_messages")
        .select("id, sender, message, created_at")
        .eq("project_id", proj.id)
        .order("created_at", { ascending: true });
      messagesMap[proj.id] = (messagesData || []) as Message[];
    }
    setProjectMessages(messagesMap);

    setLoading(false);
  }

  async function sendMessage(projectId: string) {
    const text = messageText[projectId]?.trim();
    if (!text) return;

    setSendingSaveId(projectId);
    await supabase.from("builder_messages").insert([
      {
        company_id: builder!.company_id,
        builder_id: builder!.id,
        project_id: projectId,
        sender: "builder",
        message: text,
      },
    ]);

    // Reload messages for this project
    const { data: messagesData } = await supabase
      .from("builder_messages")
      .select("id, sender, message, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true });

    setProjectMessages((prev) => ({
      ...prev,
      [projectId]: (messagesData || []) as Message[],
    }));
    setMessageText((prev) => ({
      ...prev,
      [projectId]: "",
    }));
    setSendingSaveId(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--zr-black)" }}>
        <div className="text-sm" style={{ color: "var(--zr-text-secondary)" }}>Loading portal…</div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--zr-black)" }}>
        <div className="text-center">
          <div className="text-4xl mb-3">🔍</div>
          <div className="font-semibold" style={{ color: "var(--zr-text-primary)" }}>Portal not found</div>
          <div className="text-sm mt-1" style={{ color: "var(--zr-text-secondary)" }}>This link may have expired or been removed.</div>
        </div>
      </div>
    );
  }

  const companyName = company?.name ?? builder?.company_name ?? "Company";
  const primaryColor = company?.brand_primary_color ?? "var(--zr-orange)";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--zr-black)" }}>
      {/* Header */}
      <div className="border-b px-4 py-4" style={{ backgroundColor: "var(--zr-surface-1)", borderColor: "var(--zr-border)" }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            {company?.brand_logo_url ? (
              <img src={company.brand_logo_url} alt={companyName} height={40} className="h-10 object-contain" />
            ) : (
              <ZRLogo size="md" />
            )}
          </div>
          <div className="font-semibold text-lg" style={{ color: "var(--zr-text-primary)" }}>Welcome, {builder?.contact_name || "Builder"}!</div>
          <div className="text-sm" style={{ color: "var(--zr-text-secondary)" }}>Here are your projects with {companyName}</div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {/* Projects List */}
        {projects.length === 0 ? (
          <div className="rounded-xl border px-4 py-8 text-center" style={{ backgroundColor: "var(--zr-surface-2)", borderColor: "var(--zr-border)" }}>
            <div className="text-3xl mb-2">📋</div>
            <div style={{ color: "var(--zr-text-primary)" }} className="font-semibold">No projects yet</div>
            <div style={{ color: "var(--zr-text-secondary)" }} className="text-sm mt-1">When {companyName} creates a project for you, it will appear here.</div>
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className="rounded-xl border overflow-hidden cursor-pointer transition-all"
              style={{
                backgroundColor: expandedProjectId === project.id ? "var(--zr-surface-2)" : "var(--zr-surface-1)",
                borderColor: "var(--zr-border)",
              }}
              onClick={() => setExpandedProjectId(expandedProjectId === project.id ? null : project.id)}
            >
              {/* Project header */}
              <div className="px-4 py-3 flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="font-semibold" style={{ color: "var(--zr-text-primary)" }}>{project.name}</div>
                  {project.address && (
                    <div className="text-sm mt-1" style={{ color: "var(--zr-text-secondary)" }}>📍 {project.address}</div>
                  )}
                </div>
                <div
                  className="px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0"
                  style={{
                    backgroundColor: (STATUS_COLORS[project.status] as any)?.bg || "#f3f4f6",
                    color: (STATUS_COLORS[project.status] as any)?.text || "#111",
                  }}
                >
                  {(STATUS_COLORS[project.status] as any)?.label || project.status}
                </div>
              </div>

              {/* Expanded content */}
              {expandedProjectId === project.id && (
                <div className="border-t px-4 py-4 space-y-4" style={{ borderColor: "var(--zr-border)" }}>
                  {/* Project details */}
                  {project.notes && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--zr-text-secondary)" }}>Notes</div>
                      <div className="text-sm mt-1" style={{ color: "var(--zr-text-primary)" }}>{project.notes}</div>
                    </div>
                  )}

                  {/* Linked Quotes */}
                  {projectQuotes[project.id] && projectQuotes[project.id].length > 0 && (
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--zr-text-secondary)" }}>Quotes</div>
                      <div className="space-y-2">
                        {projectQuotes[project.id].map((quoteRef) => (
                          <a
                            key={quoteRef.id}
                            href={`/q/${quoteRef.quote_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block rounded-lg border px-3 py-2 text-sm transition-colors"
                            style={{
                              backgroundColor: "var(--zr-surface-1)",
                              borderColor: "var(--zr-border)",
                              color: primaryColor,
                            }}
                          >
                            📄 View Quote → {quoteRef.quote_id.slice(0, 8)}…
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Messages */}
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--zr-text-secondary)" }}>Messages</div>
                    <div className="rounded-lg border p-3 space-y-3" style={{ backgroundColor: "var(--zr-surface-1)", borderColor: "var(--zr-border)", maxHeight: 300, overflowY: "auto" }}>
                      {projectMessages[project.id] && projectMessages[project.id].length > 0 ? (
                        projectMessages[project.id].map((msg) => (
                          <div
                            key={msg.id}
                            className={`text-sm rounded-lg px-3 py-2 max-w-xs ${msg.sender === "builder" ? "ml-auto" : ""}`}
                            style={{
                              backgroundColor: msg.sender === "builder" ? primaryColor : "var(--zr-surface-2)",
                              color: msg.sender === "builder" ? "white" : "var(--zr-text-primary)",
                            }}
                          >
                            {msg.message}
                            <div className="text-xs mt-1" style={{ color: msg.sender === "builder" ? "rgba(255,255,255,0.7)" : "var(--zr-text-secondary)" }}>
                              {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-center py-4" style={{ color: "var(--zr-text-secondary)" }}>No messages yet</div>
                      )}
                    </div>

                    {/* Message input */}
                    <div className="mt-3 flex gap-2">
                      <input
                        type="text"
                        value={messageText[project.id] || ""}
                        onChange={(e) => setMessageText((prev) => ({ ...prev, [project.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") sendMessage(project.id);
                        }}
                        placeholder="Send a message…"
                        className="flex-1 rounded-lg px-3 py-2 text-sm border"
                        style={{
                          backgroundColor: "var(--zr-surface-1)",
                          borderColor: "var(--zr-border)",
                          color: "var(--zr-text-primary)",
                        }}
                      />
                      <button
                        onClick={() => sendMessage(project.id)}
                        disabled={sendingSaveId === project.id || !messageText[project.id]?.trim()}
                        className="px-3 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                        style={{ backgroundColor: primaryColor }}
                      >
                        {sendingSaveId === project.id ? "…" : "Send"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-6 px-4" style={{ color: "var(--zr-text-secondary)" }}>
        <div className="text-xs">Powered by ZeroRemake</div>
      </div>
    </div>
  );
}
