"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { FeatureGate } from "../feature-gate";
import { PermissionGate } from "../permission-gate";
import { Skeleton, EmptyState } from "../ui";

type BuilderContact = {
  id: string;
  company_id: string;
  company_name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  portal_token: string;
  portal_pin: string | null;
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

const STATUS_BADGE: Record<string, string> = {
  bid_requested: "bg-purple-100 text-purple-700",
  quoted: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  canceled: "bg-red-100 text-red-600",
  active: "bg-green-100 text-green-700",
  inactive: "bg-gray-100 text-gray-600",
};

const STATUS_LABEL: Record<string, string> = {
  bid_requested: "Bid Requested",
  quoted: "Quoted",
  approved: "Approved",
  in_progress: "In Progress",
  completed: "Completed",
  canceled: "Canceled",
  active: "Active",
  inactive: "Inactive",
};

export default function BuildersPage() {
  return (
    <FeatureGate require="builder_portal">
      <PermissionGate require="view_customers">
        <BuildersPageInner />
      </PermissionGate>
    </FeatureGate>
  );
}

function BuildersPageInner() {
  const [builders, setBuilders] = useState<BuilderContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBuilderId, setSelectedBuilderId] = useState<string | null>(null);
  const [projects, setProjects] = useState<BuilderProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  // Add builder form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [savingBuilder, setSavingBuilder] = useState(false);

  // Edit builder form
  const [editingBuilderId, setEditingBuilderId] = useState<string | null>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editContactName, setEditContactName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editingStatus, setEditingStatus] = useState(false);

  // Add project form
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectAddress, setProjectAddress] = useState("");
  const [savingProject, setSavingProject] = useState(false);

  // Copy portal link
  const [copiedBuilderId, setCopiedBuilderId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selectedBuilderId) {
      loadProjects(selectedBuilderId);
    }
  }, [selectedBuilderId]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("builder_contacts")
      .select("*")
      .order("company_name");
    setBuilders((data || []) as BuilderContact[]);
    setLoading(false);
  }

  async function loadProjects(builderId: string) {
    setProjectsLoading(true);
    const { data } = await supabase
      .from("builder_projects")
      .select("*")
      .eq("builder_id", builderId)
      .order("created_at", { ascending: false });
    setProjects((data || []) as BuilderProject[]);
    setProjectsLoading(false);
  }

  async function addBuilder(e: React.FormEvent) {
    e.preventDefault();
    if (!newCompanyName.trim()) return;

    setSavingBuilder(true);
    const { error } = await supabase
      .from("builder_contacts")
      .insert([
        {
          company_name: newCompanyName.trim(),
          contact_name: newContactName.trim() || null,
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
          notes: newNotes.trim() || null,
          status: "active",
        },
      ]);

    setSavingBuilder(false);
    if (!error) {
      setNewCompanyName("");
      setNewContactName("");
      setNewEmail("");
      setNewPhone("");
      setNewNotes("");
      setShowAddForm(false);
      load();
    }
  }

  async function updateBuilder() {
    if (!editingBuilderId) return;
    setEditingStatus(true);

    await supabase
      .from("builder_contacts")
      .update({
        company_name: editCompanyName.trim(),
        contact_name: editContactName.trim() || null,
        email: editEmail.trim() || null,
        phone: editPhone.trim() || null,
        notes: editNotes.trim() || null,
      })
      .eq("id", editingBuilderId);

    setEditingStatus(false);
    setEditingBuilderId(null);
    load();
    if (selectedBuilderId === editingBuilderId) {
      const updated = builders.find((b) => b.id === editingBuilderId);
      if (updated) {
        setEditCompanyName(updated.company_name);
        setEditContactName(updated.contact_name ?? "");
        setEditEmail(updated.email ?? "");
        setEditPhone(updated.phone ?? "");
        setEditNotes(updated.notes ?? "");
      }
    }
  }

  function openEditBuilder(builder: BuilderContact) {
    setEditingBuilderId(builder.id);
    setEditCompanyName(builder.company_name);
    setEditContactName(builder.contact_name ?? "");
    setEditEmail(builder.email ?? "");
    setEditPhone(builder.phone ?? "");
    setEditNotes(builder.notes ?? "");
  }

  async function addProject(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedBuilderId || !projectName.trim()) return;

    setSavingProject(true);
    const { error } = await supabase
      .from("builder_projects")
      .insert([
        {
          builder_id: selectedBuilderId,
          name: projectName.trim(),
          address: projectAddress.trim() || null,
          status: "bid_requested",
        },
      ]);

    setSavingProject(false);
    if (!error) {
      setProjectName("");
      setProjectAddress("");
      setShowProjectForm(false);
      loadProjects(selectedBuilderId);
    }
  }

  function copyPortalLink(builder: BuilderContact) {
    const url = `${window.location.origin}/b/${builder.portal_token}`;
    navigator.clipboard?.writeText(url);
    setCopiedBuilderId(builder.id);
    setTimeout(() => setCopiedBuilderId(null), 2000);
  }

  function countProjectsByStatus(status: string): number {
    return projects.filter((p) => p.status === status).length;
  }

  const selectedBuilder = builders.find((b) => b.id === selectedBuilderId);

  return (
    <main
      style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }}
      className="min-h-screen p-4 text-sm"
    >
      <div className="mx-auto max-w-6xl">
        <Link href="/" style={{ color: "var(--zr-orange)" }} className="hover:underline">
          ← Back to Dashboard
        </Link>

        <div className="mt-3 mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Builder Portal Management</h1>
          <button
            onClick={() => {
              setShowAddForm(true);
              setNewCompanyName("");
              setNewContactName("");
              setNewEmail("");
              setNewPhone("");
              setNewNotes("");
            }}
            className="rounded px-3 py-2 text-white font-medium"
            style={{ background: "var(--zr-orange)" }}
          >
            + Add Builder
          </button>
        </div>

        <div className="grid grid-cols-3 gap-4">
          {/* Left: Builder List */}
          <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-4">
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--zr-text-secondary)" }}>
              Builders ({loading ? "…" : builders.length})
            </h2>

            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {[1, 2, 3].map((i) => (
                  <div key={i} style={{ background: "var(--zr-surface-2)", borderRadius: "var(--zr-radius-sm)", padding: "12px" }}>
                    <Skeleton w="70%" h="14px" />
                    <div style={{ height: 6 }} />
                    <Skeleton w="50%" h="10px" />
                  </div>
                ))}
              </div>
            ) : builders.length === 0 ? (
              <EmptyState type="customers" title="No builders yet" subtitle="Add your first builder to get started." action="+ Add Builder" onAction={() => setShowAddForm(true)} />
            ) : (
              <ul className="space-y-2">
                {builders.map((builder) => (
                  <li key={builder.id}>
                    <button
                      onClick={() => setSelectedBuilderId(builder.id)}
                      className="w-full text-left rounded p-3 transition-colors"
                      style={{
                        background: selectedBuilderId === builder.id ? "var(--zr-surface-3)" : "transparent",
                        border: selectedBuilderId === builder.id ? "1px solid var(--zr-orange)" : "1px solid var(--zr-border)",
                      }}
                    >
                      <div style={{ color: selectedBuilderId === builder.id ? "var(--zr-orange)" : "var(--zr-text-primary)" }} className="font-medium">
                        {builder.company_name}
                      </div>
                      {builder.contact_name && (
                        <div className="text-xs mt-0.5" style={{ color: "var(--zr-text-secondary)" }}>
                          {builder.contact_name}
                        </div>
                      )}
                      <span
                        className="text-xs rounded px-1.5 py-0.5 inline-block mt-1.5"
                        style={STATUS_BADGE[builder.status] ? { ...STATUS_BADGE[builder.status].split(" ").reduce((acc, cls) => acc, {}) } : {}}
                      >
                        <span style={{ background: builder.status === "active" ? "rgba(34, 197, 94, 0.2)" : "rgba(107, 114, 128, 0.2)", color: builder.status === "active" ? "rgb(22, 163, 74)" : "rgb(75, 85, 99)", padding: "2px 6px", borderRadius: "4px" }}>
                          {STATUS_LABEL[builder.status] || builder.status}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Right: Details & Projects */}
          <div className="col-span-2 space-y-4">
            {selectedBuilder ? (
              <>
                {/* Builder Details Card */}
                <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold" style={{ color: "var(--zr-text-secondary)" }}>
                      Builder Info
                    </h2>
                    {editingBuilderId === selectedBuilder.id ? (
                      <button
                        onClick={updateBuilder}
                        disabled={editingStatus}
                        className="text-xs rounded px-2 py-1 text-white font-medium"
                        style={{ background: editingStatus ? "var(--zr-text-muted)" : "var(--zr-success)" }}
                      >
                        {editingStatus ? "Saving…" : "Save"}
                      </button>
                    ) : (
                      <button
                        onClick={() => openEditBuilder(selectedBuilder)}
                        className="text-xs rounded px-2 py-1 text-white font-medium"
                        style={{ background: "var(--zr-orange)" }}
                      >
                        Edit
                      </button>
                    )}
                  </div>

                  {editingBuilderId === selectedBuilder.id ? (
                    <form className="space-y-3">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                          Company Name
                        </label>
                        <input
                          type="text"
                          value={editCompanyName}
                          onChange={(e) => setEditCompanyName(e.target.value)}
                          className="w-full rounded px-2.5 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                          Contact Name
                        </label>
                        <input
                          type="text"
                          value={editContactName}
                          onChange={(e) => setEditContactName(e.target.value)}
                          className="w-full rounded px-2.5 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                          Email
                        </label>
                        <input
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmail(e.target.value)}
                          className="w-full rounded px-2.5 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                          Phone
                        </label>
                        <input
                          type="tel"
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          className="w-full rounded px-2.5 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                          Notes
                        </label>
                        <textarea
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          rows={2}
                          className="w-full rounded px-2.5 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                        />
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <div>
                        <div style={{ color: "var(--zr-text-secondary)" }} className="text-xs font-medium mb-0.5">
                          Company Name
                        </div>
                        <div>{selectedBuilder.company_name}</div>
                      </div>
                      {selectedBuilder.contact_name && (
                        <div>
                          <div style={{ color: "var(--zr-text-secondary)" }} className="text-xs font-medium mb-0.5">
                            Contact Name
                          </div>
                          <div>{selectedBuilder.contact_name}</div>
                        </div>
                      )}
                      {selectedBuilder.email && (
                        <div>
                          <div style={{ color: "var(--zr-text-secondary)" }} className="text-xs font-medium mb-0.5">
                            Email
                          </div>
                          <div className="break-all">{selectedBuilder.email}</div>
                        </div>
                      )}
                      {selectedBuilder.phone && (
                        <div>
                          <div style={{ color: "var(--zr-text-secondary)" }} className="text-xs font-medium mb-0.5">
                            Phone
                          </div>
                          <div>{selectedBuilder.phone}</div>
                        </div>
                      )}
                      {selectedBuilder.notes && (
                        <div>
                          <div style={{ color: "var(--zr-text-secondary)" }} className="text-xs font-medium mb-0.5">
                            Notes
                          </div>
                          <div className="whitespace-pre-wrap text-xs">{selectedBuilder.notes}</div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Portal Link Card */}
                <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-4">
                  <h3 className="text-sm font-semibold mb-3" style={{ color: "var(--zr-text-secondary)" }}>
                    Portal Link
                  </h3>
                  <div className="rounded p-3 space-y-2" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                    <div className="font-mono text-xs break-all" style={{ color: "var(--zr-text-primary)" }}>
                      {`${typeof window !== "undefined" ? window.location.origin : ""}/b/${selectedBuilder.portal_token}`}
                    </div>
                    <button
                      onClick={() => copyPortalLink(selectedBuilder)}
                      className="text-xs rounded px-2.5 py-1 text-white font-medium"
                      style={{ background: copiedBuilderId === selectedBuilder.id ? "var(--zr-success)" : "var(--zr-orange)" }}
                    >
                      {copiedBuilderId === selectedBuilder.id ? "✓ Copied" : "Copy Link"}
                    </button>
                  </div>
                </div>

                {/* Projects Section */}
                <div style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }} className="rounded p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold" style={{ color: "var(--zr-text-secondary)" }}>
                      Projects ({projectsLoading ? "…" : projects.length})
                    </h3>
                    {!showProjectForm && (
                      <button
                        onClick={() => setShowProjectForm(true)}
                        className="text-xs rounded px-2 py-1 text-white font-medium"
                        style={{ background: "var(--zr-orange)" }}
                      >
                        + Add Project
                      </button>
                    )}
                  </div>

                  {showProjectForm && (
                    <form onSubmit={addProject} className="mb-4 p-3 rounded space-y-3" style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                          Project Name *
                        </label>
                        <input
                          type="text"
                          value={projectName}
                          onChange={(e) => setProjectName(e.target.value)}
                          placeholder="e.g., Aspen Heights Phase 1"
                          className="w-full rounded px-2.5 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-3)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                          Address
                        </label>
                        <input
                          type="text"
                          value={projectAddress}
                          onChange={(e) => setProjectAddress(e.target.value)}
                          placeholder="e.g., 123 Main St, Aspen, CO 81611"
                          className="w-full rounded px-2.5 py-1.5 text-sm"
                          style={{ background: "var(--zr-surface-3)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={savingProject}
                          className="text-xs rounded px-3 py-1.5 text-white font-medium"
                          style={{ background: savingProject ? "var(--zr-text-muted)" : "var(--zr-success)" }}
                        >
                          {savingProject ? "Saving…" : "Create Project"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowProjectForm(false);
                            setProjectName("");
                            setProjectAddress("");
                          }}
                          className="text-xs rounded px-3 py-1.5 font-medium"
                          style={{ background: "var(--zr-surface-3)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}

                  {projectsLoading ? (
                    <Skeleton lines={3} />
                  ) : projects.length === 0 ? (
                    <div style={{ color: "var(--zr-text-secondary)" }} className="text-xs py-4 text-center">
                      No projects yet. Add one to get started.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {projects.map((project) => (
                        <div
                          key={project.id}
                          className="rounded p-3"
                          style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div style={{ color: "var(--zr-text-primary)" }} className="font-medium text-sm">
                                {project.name}
                              </div>
                              {project.address && (
                                <div className="text-xs mt-0.5 truncate" style={{ color: "var(--zr-text-secondary)" }}>
                                  {project.address}
                                </div>
                              )}
                            </div>
                            <span
                              className="text-xs rounded px-2 py-1 whitespace-nowrap font-medium"
                              style={STATUS_BADGE[project.status] ? { ...STATUS_BADGE[project.status].split(" ").reduce((acc, cls) => acc, {}) } : {}}
                            >
                              <span
                                style={{
                                  background:
                                    project.status === "bid_requested"
                                      ? "rgba(147, 112, 219, 0.2)"
                                      : project.status === "quoted"
                                        ? "rgba(59, 130, 246, 0.2)"
                                        : project.status === "approved"
                                          ? "rgba(34, 197, 94, 0.2)"
                                          : project.status === "in_progress"
                                            ? "rgba(217, 119, 6, 0.2)"
                                            : project.status === "completed"
                                              ? "rgba(5, 150, 105, 0.2)"
                                              : "rgba(239, 68, 68, 0.2)",
                                  color:
                                    project.status === "bid_requested"
                                      ? "rgb(147, 112, 219)"
                                      : project.status === "quoted"
                                        ? "rgb(59, 130, 246)"
                                        : project.status === "approved"
                                          ? "rgb(34, 197, 94)"
                                          : project.status === "in_progress"
                                            ? "rgb(217, 119, 6)"
                                            : project.status === "completed"
                                              ? "rgb(5, 150, 105)"
                                              : "rgb(239, 68, 68)",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  display: "inline-block",
                                }}
                              >
                                {STATUS_LABEL[project.status] || project.status}
                              </span>
                            </span>
                          </div>
                          {project.notes && (
                            <div className="text-xs mt-2 whitespace-pre-wrap" style={{ color: "var(--zr-text-secondary)" }}>
                              {project.notes}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="col-span-2 flex items-center justify-center rounded p-8" style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", minHeight: "300px" }}>
                <div style={{ color: "var(--zr-text-secondary)", textAlign: "center" }}>
                  <div style={{ fontSize: "32px", marginBottom: "8px" }}>📋</div>
                  <p>Select a builder to view details and projects</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Builder Modal */}
      {showAddForm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
          onClick={() => setShowAddForm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="rounded-lg p-6 max-w-md w-full mx-4"
            style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
          >
            <h2 className="text-lg font-bold mb-4">Add New Builder</h2>
            <form onSubmit={addBuilder} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                  Company Name *
                </label>
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  placeholder="e.g., ABC Builders"
                  className="w-full rounded px-3 py-2 text-sm"
                  style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                  Contact Name
                </label>
                <input
                  type="text"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="e.g., John Smith"
                  className="w-full rounded px-3 py-2 text-sm"
                  style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                  Email
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="john@abcbuilders.com"
                  className="w-full rounded px-3 py-2 text-sm"
                  style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full rounded px-3 py-2 text-sm"
                  style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: "var(--zr-text-secondary)" }}>
                  Notes
                </label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Any additional notes..."
                  rows={2}
                  className="w-full rounded px-3 py-2 text-sm"
                  style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={savingBuilder}
                  className="flex-1 rounded px-4 py-2 text-white font-medium"
                  style={{ background: savingBuilder ? "var(--zr-text-muted)" : "var(--zr-orange)" }}
                >
                  {savingBuilder ? "Adding…" : "Add Builder"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 rounded px-4 py-2 font-medium"
                  style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)", color: "var(--zr-text-primary)" }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
