"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../auth-provider";
import { PermissionGate } from "../../permission-gate";

// ── Types ──────────────────────────────────────────────────────
type Integration = {
  id: string;
  provider: string;
  display_name: string;
  status: "not_connected" | "pending" | "connected" | "error";
  connected_at: string | null;
  account_id: string | null;
  category: "payments" | "accounting";
  is_default: boolean;
  config: Record<string, unknown>;
};

type ManualMethod = {
  key: string;
  label: string;
  icon: string;
};

// ── Provider catalog ──────────────────────────────────────────
const PAYMENT_PROVIDERS = [
  {
    provider: "stripe",
    display_name: "Stripe",
    category: "payments" as const,
    description: "Accept credit cards, debit cards, and ACH bank transfers. Funds deposit directly to your bank account.",
    features: ["Credit & debit cards", "ACH bank transfers", "Automatic payouts", "Customer payment portal"],
    icon: "💳",
    color: "#635BFF",
  },
  {
    provider: "square",
    display_name: "Square",
    category: "payments" as const,
    description: "Accept card payments online and in-person with tap-to-pay. Great if you already use Square for your business.",
    features: ["Credit & debit cards", "Tap-to-pay in person", "Square invoicing", "Next-day deposits"],
    icon: "⬛",
    color: "#006AFF",
  },
  {
    provider: "paypal",
    display_name: "PayPal & Venmo",
    category: "payments" as const,
    description: "Let customers pay with PayPal balance, cards, or Venmo. One connection covers both services.",
    features: ["PayPal payments", "Venmo payments", "Pay Later options", "Buyer protection"],
    icon: "🅿️",
    color: "#003087",
  },
];

const ACCOUNTING_PROVIDERS = [
  {
    provider: "quickbooks",
    display_name: "QuickBooks Online",
    category: "accounting" as const,
    description: "Automatically sync invoices and payments to QuickBooks. No more double entry for your bookkeeper.",
    features: ["Invoice sync", "Payment sync", "Customer sync", "Tax reporting"],
    icon: "📗",
    color: "#2CA01C",
  },
  {
    provider: "xero",
    display_name: "Xero",
    category: "accounting" as const,
    description: "Sync your invoicing data to Xero for seamless accounting and financial reporting.",
    features: ["Invoice sync", "Payment sync", "Bank reconciliation", "Financial reports"],
    icon: "📘",
    color: "#13B5EA",
  },
];

const MANUAL_METHODS: ManualMethod[] = [
  { key: "cash", label: "Cash", icon: "💵" },
  { key: "check", label: "Check", icon: "📝" },
  { key: "zelle", label: "Zelle", icon: "⚡" },
  { key: "venmo", label: "Venmo", icon: "✌️" },
  { key: "ach", label: "ACH / Bank Transfer", icon: "🏦" },
  { key: "wire", label: "Wire Transfer", icon: "🔗" },
];

// ── Provider Card ─────────────────────────────────────────────
function ProviderCard({
  provider,
  display_name,
  description,
  features,
  icon,
  color,
  integration,
  onConnect,
  onDisconnect,
  onSetDefault,
}: {
  provider: string;
  display_name: string;
  description: string;
  features: string[];
  icon: string;
  color: string;
  integration: Integration | null;
  onConnect: (provider: string) => void;
  onDisconnect: (id: string) => void;
  onSetDefault: (id: string) => void;
}) {
  const isConnected = integration?.status === "connected";
  const isPending = integration?.status === "pending";
  const isDefault = integration?.is_default;

  return (
    <div
      style={{
        background: "var(--zr-surface-1)",
        border: isConnected ? `2px solid ${color}` : "1px solid var(--zr-border)",
      }}
      className="rounded-lg p-4 space-y-3"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
            style={{ background: `${color}15` }}
          >
            {icon}
          </div>
          <div>
            <h3 className="font-semibold">{display_name}</h3>
            {isConnected && (
              <span className="text-xs text-green-600 font-medium">Connected</span>
            )}
            {isPending && (
              <span className="text-xs text-amber-600 font-medium">Setup in progress</span>
            )}
          </div>
        </div>
        {isDefault && (
          <span
            className="text-xs rounded-full px-2 py-0.5 font-medium"
            style={{ background: `${color}20`, color }}
          >
            Default
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
        {description}
      </p>

      {/* Features */}
      <div className="flex flex-wrap gap-1.5">
        {features.map((f) => (
          <span
            key={f}
            className="text-xs rounded px-2 py-0.5"
            style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-secondary)" }}
          >
            {f}
          </span>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {isConnected ? (
          <>
            {!isDefault && (
              <button
                onClick={() => onSetDefault(integration!.id)}
                style={{ background: `${color}`, color: "#fff" }}
                className="flex-1 rounded p-2 text-xs font-medium hover:opacity-90"
              >
                Set as Default
              </button>
            )}
            <button
              onClick={() => onDisconnect(integration!.id)}
              style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
              className="flex-1 rounded p-2 text-xs font-medium hover:opacity-80"
            >
              Disconnect
            </button>
          </>
        ) : isPending ? (
          <button
            onClick={() => onConnect(provider)}
            style={{ background: `${color}`, color: "#fff" }}
            className="flex-1 rounded p-2 text-xs font-medium hover:opacity-90"
          >
            Continue Setup
          </button>
        ) : (
          <button
            onClick={() => onConnect(provider)}
            style={{ background: `${color}`, color: "#fff" }}
            className="flex-1 rounded p-2 text-xs font-medium hover:opacity-90"
          >
            Connect {display_name}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Connect Modal ─────────────────────────────────────────────
function ConnectModal({
  open,
  onClose,
  provider,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  provider: (typeof PAYMENT_PROVIDERS)[0] | (typeof ACCOUNTING_PROVIDERS)[0] | null;
  onSave: (provider: string, accountId: string) => void;
}) {
  const [accountId, setAccountId] = useState("");
  const [saving, setSaving] = useState(false);

  if (!open || !provider) return null;

  const isAccounting = provider.category === "accounting";

  const placeholders: Record<string, string> = {
    stripe: "e.g. acct_1234567890",
    square: "e.g. your Square merchant ID",
    paypal: "e.g. your PayPal business email",
    quickbooks: "e.g. your QuickBooks company ID",
    xero: "e.g. your Xero organization ID",
  };

  const instructions: Record<string, string[]> = {
    stripe: [
      "Sign up or log in at stripe.com",
      "Go to Settings → Account Details",
      "Copy your Account ID and paste it below",
      "We'll walk you through connecting via Stripe Connect",
    ],
    square: [
      "Log in to your Square Dashboard",
      "Go to Account & Settings → Business",
      "Copy your Merchant ID and paste it below",
      "We'll complete the connection on the next step",
    ],
    paypal: [
      "Log in to your PayPal Business account",
      "Your account email is your identifier",
      "Enter your PayPal business email below",
      "Both PayPal and Venmo payments will be enabled",
    ],
    quickbooks: [
      "Log in to QuickBooks Online",
      "Go to Settings ⚙ → Account and Settings",
      "Your Company ID is in the URL or account info",
      "We'll sync invoices and payments automatically",
    ],
    xero: [
      "Log in to your Xero account",
      "Go to Settings → General Settings",
      "Copy your Organization ID",
      "Invoice and payment data will sync both ways",
    ],
  };

  async function handleSave() {
    if (!accountId.trim() || !provider) return;
    setSaving(true);
    await onSave(provider.provider, accountId.trim());
    setSaving(false);
    setAccountId("");
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
        className="rounded-lg max-w-md w-full p-5 space-y-4"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
            style={{ background: `${provider.color}15` }}
          >
            {provider.icon}
          </div>
          <div>
            <h2 className="font-bold text-lg">Connect {provider.display_name}</h2>
            <p className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
              {isAccounting ? "Accounting sync" : "Payment processing"}
            </p>
          </div>
        </div>

        {/* Setup steps */}
        <div
          className="rounded p-3 space-y-2"
          style={{ background: "var(--zr-surface-2)" }}
        >
          <p className="text-xs font-semibold">Setup Steps:</p>
          <ol className="text-xs space-y-1.5" style={{ color: "var(--zr-text-secondary)" }}>
            {(instructions[provider.provider] || []).map((step, i) => (
              <li key={i} className="flex gap-2">
                <span
                  className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: `${provider.color}20`, color: provider.color }}
                >
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        {/* Account ID input */}
        <div>
          <label className="text-xs font-medium block mb-1">
            {provider.provider === "paypal" ? "Business Email" : "Account / Company ID"}
          </label>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder={placeholders[provider.provider] || "Enter your account ID"}
            style={{
              background: "var(--zr-surface-2)",
              border: "1px solid var(--zr-border)",
              color: "var(--zr-text-primary)",
            }}
            className="w-full rounded p-2 text-sm"
          />
        </div>

        <p className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
          Your credentials are stored securely. Full OAuth connection will be completed in a future update — for now we&apos;ll save your account info so you&apos;re ready to go.
        </p>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            style={{ background: "var(--zr-surface-2)", border: "1px solid var(--zr-border)" }}
            className="flex-1 rounded p-2 text-sm font-medium hover:opacity-80"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!accountId.trim() || saving}
            style={{ background: provider.color, color: "#fff" }}
            className="flex-1 rounded p-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function IntegrationsPage() {
  const { companyId, role } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [enabledMethods, setEnabledMethods] = useState<string[]>(["cash", "check", "zelle", "venmo"]);
  const [instructions, setInstructions] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [connectModal, setConnectModal] = useState<
    (typeof PAYMENT_PROVIDERS)[0] | (typeof ACCOUNTING_PROVIDERS)[0] | null
  >(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    load();
  }, [companyId]);

  async function load() {
    setLoading(true);

    // Load integrations
    const { data: intData } = await supabase
      .from("payment_integrations")
      .select("*")
      .order("created_at", { ascending: true });
    setIntegrations(intData || []);

    // Load company settings for manual methods
    const { data: settings } = await supabase
      .from("company_settings")
      .select("enabled_payment_methods, payment_instructions")
      .single();

    if (settings) {
      setEnabledMethods(settings.enabled_payment_methods || ["cash", "check", "zelle", "venmo"]);
      setInstructions(settings.payment_instructions || {});
    }

    setLoading(false);
  }

  function getIntegration(provider: string): Integration | null {
    return integrations.find((i) => i.provider === provider) || null;
  }

  async function connectProvider(provider: string, accountId: string) {
    const allProviders = [...PAYMENT_PROVIDERS, ...ACCOUNTING_PROVIDERS];
    const providerInfo = allProviders.find((p) => p.provider === provider);
    if (!providerInfo) return;

    const existing = getIntegration(provider);

    if (existing) {
      // Update existing
      await supabase
        .from("payment_integrations")
        .update({
          status: "connected",
          account_id: accountId,
          connected_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      // Insert new
      await supabase.from("payment_integrations").insert({
        provider,
        display_name: providerInfo.display_name,
        category: providerInfo.category,
        status: "connected",
        account_id: accountId,
        connected_at: new Date().toISOString(),
        is_default: integrations.filter((i) => i.category === providerInfo.category && i.status === "connected").length === 0,
      });
    }

    load();
  }

  async function disconnectProvider(id: string) {
    if (!confirm("Disconnect this payment service? You can reconnect anytime.")) return;
    await supabase
      .from("payment_integrations")
      .update({ status: "not_connected", account_id: null, connected_at: null, is_default: false })
      .eq("id", id);
    load();
  }

  async function setAsDefault(id: string) {
    const integration = integrations.find((i) => i.id === id);
    if (!integration) return;

    // Unset all defaults in same category
    const sameCategory = integrations.filter((i) => i.category === integration.category);
    for (const i of sameCategory) {
      if (i.is_default) {
        await supabase.from("payment_integrations").update({ is_default: false }).eq("id", i.id);
      }
    }

    // Set this one as default
    await supabase.from("payment_integrations").update({ is_default: true }).eq("id", id);
    load();
  }

  async function toggleManualMethod(method: string) {
    const updated = enabledMethods.includes(method)
      ? enabledMethods.filter((m) => m !== method)
      : [...enabledMethods, method];
    setEnabledMethods(updated);

    await supabase
      .from("company_settings")
      .update({ enabled_payment_methods: updated })
      .eq("company_id", companyId);

    flashSaved();
  }

  async function saveInstruction(method: string, value: string) {
    const updated = { ...instructions, [method]: value };
    setInstructions(updated);

    await supabase
      .from("company_settings")
      .update({ payment_instructions: updated })
      .eq("company_id", companyId);

    flashSaved();
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  if (loading) {
    return (
      <PermissionGate require="access_settings">
        <main style={{ background: "var(--zr-black)", minHeight: "100vh", padding: "24px" }}>
          <div style={{ maxWidth: 672, margin: "0 auto" }}>
            <div className="zr-skeleton" style={{ width: "200px", height: "22px", borderRadius: "var(--zr-radius-sm)", marginBottom: "20px" }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {[1,2,3,4].map(i => (
                <div key={i} style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)", borderRadius: "var(--zr-radius-md)", padding: "16px" }}>
                  <div className="zr-skeleton" style={{ width: "60%", height: "14px", borderRadius: "var(--zr-radius-sm)", marginBottom: "8px" }} />
                  <div className="zr-skeleton" style={{ width: "40%", height: "10px", borderRadius: "var(--zr-radius-sm)" }} />
                </div>
              ))}
            </div>
          </div>
        </main>
      </PermissionGate>
    );
  }

  const connectedPayments = integrations.filter(
    (i) => i.category === "payments" && i.status === "connected"
  );
  const connectedAccounting = integrations.filter(
    (i) => i.category === "accounting" && i.status === "connected"
  );

  return (
    <PermissionGate require="access_settings">
      <main
        style={{ background: "var(--zr-black)", color: "var(--zr-text-primary)" }}
        className="min-h-screen p-4 text-sm"
      >
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Payment Connections</h1>
              <p className="text-xs mt-1" style={{ color: "var(--zr-text-secondary)" }}>
                Connect payment services so your customers can pay you directly through invoices.
              </p>
            </div>
            <Link
              href="/settings"
              className="text-xs hover:underline"
              style={{ color: "var(--zr-orange)" }}
            >
              ← Back to Settings
            </Link>
          </div>

          {/* Status summary */}
          <div
            className="rounded-lg p-4 flex items-center gap-4"
            style={{ background: "var(--zr-surface-1)", border: "1px solid var(--zr-border)" }}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    connectedPayments.length > 0 ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
                <span className="text-xs font-medium">
                  {connectedPayments.length > 0
                    ? `${connectedPayments.length} payment ${connectedPayments.length === 1 ? "service" : "services"} connected`
                    : "No payment services connected"}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    connectedAccounting.length > 0 ? "bg-green-500" : "bg-gray-300"
                  }`}
                />
                <span className="text-xs font-medium">
                  {connectedAccounting.length > 0
                    ? `${connectedAccounting.length} accounting ${connectedAccounting.length === 1 ? "service" : "services"} connected`
                    : "No accounting services connected"}
                </span>
              </div>
            </div>
            <div className="text-xs" style={{ color: "var(--zr-text-secondary)" }}>
              {enabledMethods.length} manual {enabledMethods.length === 1 ? "method" : "methods"} enabled
            </div>
          </div>

          {/* Online Payment Services */}
          <section>
            <h2 className="font-semibold mb-1">Accept Payments Online</h2>
            <p className="text-xs mb-3" style={{ color: "var(--zr-text-secondary)" }}>
              Let customers pay directly through their invoice link. Funds go to your account.
            </p>
            <div className="grid gap-3">
              {PAYMENT_PROVIDERS.map((p) => (
                <ProviderCard
                  key={p.provider}
                  {...p}
                  integration={getIntegration(p.provider)}
                  onConnect={(provider) => {
                    const info = [...PAYMENT_PROVIDERS, ...ACCOUNTING_PROVIDERS].find(
                      (pp) => pp.provider === provider
                    );
                    setConnectModal(info || null);
                  }}
                  onDisconnect={disconnectProvider}
                  onSetDefault={setAsDefault}
                />
              ))}
            </div>
          </section>

          {/* Accounting Sync */}
          <section>
            <h2 className="font-semibold mb-1">Accounting Sync</h2>
            <p className="text-xs mb-3" style={{ color: "var(--zr-text-secondary)" }}>
              Automatically sync invoices and payments to your accounting software. No double entry.
            </p>
            <div className="grid gap-3">
              {ACCOUNTING_PROVIDERS.map((p) => (
                <ProviderCard
                  key={p.provider}
                  {...p}
                  integration={getIntegration(p.provider)}
                  onConnect={(provider) => {
                    const info = [...PAYMENT_PROVIDERS, ...ACCOUNTING_PROVIDERS].find(
                      (pp) => pp.provider === provider
                    );
                    setConnectModal(info || null);
                  }}
                  onDisconnect={disconnectProvider}
                  onSetDefault={setAsDefault}
                />
              ))}
            </div>
          </section>

          {/* Manual Payment Methods */}
          <section>
            <div className="flex items-center justify-between mb-1">
              <h2 className="font-semibold">Manual Payment Methods</h2>
              {saved && <span className="text-xs text-green-600 font-medium">Saved!</span>}
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--zr-text-secondary)" }}>
              Toggle which manual methods you accept. These appear on customer-facing invoices.
            </p>
            <div className="space-y-2">
              {MANUAL_METHODS.map((m) => {
                const enabled = enabledMethods.includes(m.key);
                return (
                  <div
                    key={m.key}
                    style={{
                      background: "var(--zr-surface-1)",
                      border: enabled ? "1px solid var(--zr-orange)" : "1px solid var(--zr-border)",
                    }}
                    className="rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{m.icon}</span>
                        <span className="font-medium text-sm">{m.label}</span>
                      </div>
                      <button
                        onClick={() => toggleManualMethod(m.key)}
                        className={`relative w-10 h-5 rounded-full transition-colors ${
                          enabled ? "bg-orange-500" : "bg-gray-300"
                        }`}
                        style={enabled ? { background: "var(--zr-orange)" } : {}}
                      >
                        <div
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                            enabled ? "translate-x-5" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Instructions input (only when enabled) */}
                    {enabled && (
                      <div className="mt-2">
                        <input
                          type="text"
                          value={instructions[m.key] || ""}
                          onChange={(e) => saveInstruction(m.key, e.target.value)}
                          placeholder={`Instructions for ${m.label} (e.g. "Make checks payable to...")`}
                          style={{
                            background: "var(--zr-surface-2)",
                            border: "1px solid var(--zr-border)",
                            color: "var(--zr-text-primary)",
                          }}
                          className="w-full rounded p-2 text-xs"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Info footer */}
          <div
            className="rounded-lg p-4 text-xs"
            style={{ background: "var(--zr-surface-2)", color: "var(--zr-text-secondary)" }}
          >
            <p className="font-semibold mb-1" style={{ color: "var(--zr-text-primary)" }}>
              How it works
            </p>
            <p>
              When you send an invoice to a customer, they&apos;ll see your enabled payment options on the invoice page.
              Connected services show a &quot;Pay Now&quot; button. Manual methods show your instructions (like where to send a check or Zelle payment).
              All payments — whether online or manually recorded — are tracked in one place.
            </p>
          </div>
        </div>

        <ConnectModal
          open={!!connectModal}
          onClose={() => setConnectModal(null)}
          provider={connectModal}
          onSave={connectProvider}
        />
      </main>
    </PermissionGate>
  );
}
