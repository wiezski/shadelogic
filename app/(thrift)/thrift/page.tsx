"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getAllItems, getStats } from "@/lib/thrift-store";
import { ThriftItem, ItemStatus } from "@/lib/thrift-types";

const STATUS_COLORS: Record<ItemStatus, string> = {
  intake: "#ff9800",
  photographed: "#2196f3",
  listed: "#9c27b0",
  sold: "#4caf50",
  shipped: "#607d8b",
};

const STATUS_LABELS: Record<ItemStatus, string> = {
  intake: "Intake",
  photographed: "Ready to List",
  listed: "Listed",
  sold: "Sold",
  shipped: "Shipped",
};

export default function InventoryPage() {
  const [items, setItems] = useState<ThriftItem[]>([]);
  const [filter, setFilter] = useState<ItemStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState(getStats());

  useEffect(() => {
    setItems(getAllItems());
    setStats(getStats());
  }, []);

  const filtered = items.filter((item) => {
    if (filter !== "all" && item.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.eraStyle.toLowerCase().includes(q) ||
        item.storageLocation.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div>
      {/* Stats Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "16px" }}>
        <StatCard label="Total Items" value={stats.totalItems} />
        <StatCard label="Listed" value={stats.listed} />
        <StatCard label="Invested" value={`$${stats.totalInvested.toFixed(0)}`} />
        <StatCard label="Revenue" value={`$${stats.totalRevenue.toFixed(0)}`} color={stats.totalRevenue > 0 ? "#2e7d32" : undefined} />
      </div>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search items, SKUs, locations..."
        style={{
          width: "100%", padding: "10px 14px", border: "1px solid #ddd",
          borderRadius: "10px", fontSize: "15px", marginBottom: "12px",
          boxSizing: "border-box", background: "white",
        }}
      />

      {/* Status filter chips */}
      <div style={{ display: "flex", gap: "6px", overflowX: "auto", marginBottom: "16px", paddingBottom: "4px" }}>
        <Chip label="All" active={filter === "all"} onClick={() => setFilter("all")} />
        {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((s) => (
          <Chip key={s} label={STATUS_LABELS[s]} active={filter === s} onClick={() => setFilter(s)} color={STATUS_COLORS[s]} />
        ))}
      </div>

      {/* Items list */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "#888" }}>
          {items.length === 0 ? (
            <>
              <p style={{ fontSize: "40px", marginBottom: "8px" }}>📷</p>
              <p style={{ fontWeight: 600 }}>No items yet</p>
              <p style={{ fontSize: "13px" }}>Tap &ldquo;Add Item&rdquo; to photograph your first piece</p>
            </>
          ) : (
            <p>No items match your search</p>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {filtered.map((item) => (
            <Link key={item.id} href={`/thrift/${item.id}`} style={{ textDecoration: "none", color: "inherit" }}>
              <div style={{
                background: "white", borderRadius: "12px", padding: "12px",
                display: "flex", gap: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              }}>
                {/* Thumbnail */}
                <div style={{ width: 64, height: 64, borderRadius: "8px", overflow: "hidden", flexShrink: 0, background: "#eee" }}>
                  {item.photos[0] ? (
                    <img src={item.photos[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc" }}>📷</div>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </h3>
                    <span style={{
                      fontSize: "11px", fontWeight: 600, padding: "2px 8px",
                      borderRadius: "12px", background: STATUS_COLORS[item.status] + "20",
                      color: STATUS_COLORS[item.status], whiteSpace: "nowrap", marginLeft: "8px",
                    }}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </div>
                  <p style={{ margin: "2px 0", fontSize: "12px", color: "#888" }}>
                    {item.sku} · {item.category} · {item.storageLocation || "No location"}
                  </p>
                  <div style={{ display: "flex", gap: "12px", fontSize: "13px", marginTop: "4px" }}>
                    {item.purchasePrice > 0 && <span>Paid: <b>${item.purchasePrice}</b></span>}
                    {item.listingPrice && <span>Listed: <b style={{ color: "#9c27b0" }}>${item.listingPrice}</b></span>}
                    {item.soldPrice && <span>Sold: <b style={{ color: "#2e7d32" }}>${item.soldPrice}</b></span>}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Floating Add button */}
      <Link href="/thrift/add" style={{
        position: "fixed", bottom: "80px", right: "20px",
        width: "56px", height: "56px", borderRadius: "50%",
        background: "#1a1a2e", color: "white",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "28px", textDecoration: "none",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}>
        +
      </Link>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: "white", borderRadius: "10px", padding: "12px", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      <p style={{ margin: 0, fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</p>
      <p style={{ margin: "4px 0 0", fontSize: "22px", fontWeight: 700, color: color || "#1a1a2e" }}>{value}</p>
    </div>
  );
}

function Chip({ label, active, onClick, color }: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: "20px", fontSize: "12px", fontWeight: 600,
        border: "none", cursor: "pointer", whiteSpace: "nowrap",
        background: active ? (color || "#1a1a2e") : "white",
        color: active ? "white" : "#555",
        boxShadow: active ? "none" : "0 1px 2px rgba(0,0,0,0.08)",
      }}
    >
      {label}
    </button>
  );
}
