"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { getItem, updateItem, deleteItem } from "@/lib/thrift-store";
import { ThriftItem, ItemStatus } from "@/lib/thrift-types";

const STATUS_FLOW: ItemStatus[] = ["intake", "photographed", "listed", "sold", "shipped"];
const STATUS_LABELS: Record<ItemStatus, string> = {
  intake: "Intake", photographed: "Ready to List", listed: "Listed", sold: "Sold", shipped: "Shipped",
};

export default function ItemDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<ThriftItem | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [soldPrice, setSoldPrice] = useState("");
  const [showSoldInput, setShowSoldInput] = useState(false);
  const [listingLoading, setListingLoading] = useState(false);
  const qrRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const found = getItem(id);
    if (found) {
      setItem(found);
      setSoldPrice(String(found.soldPrice || ""));
    }
  }, [id]);

  if (!item) {
    return <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>Item not found</div>;
  }

  const advanceStatus = () => {
    const currentIdx = STATUS_FLOW.indexOf(item.status);
    if (currentIdx < STATUS_FLOW.length - 1) {
      const nextStatus = STATUS_FLOW[currentIdx + 1];
      if (nextStatus === "sold") {
        setShowSoldInput(true);
        return;
      }
      const updates: Partial<ThriftItem> = { status: nextStatus };
      if (nextStatus === "shipped") updates.shippedAt = new Date().toISOString();
      const updated = updateItem(item.id, updates);
      if (updated) setItem(updated);
    }
  };

  const markSold = () => {
    const price = parseFloat(soldPrice);
    if (!price) return;
    const updated = updateItem(item.id, {
      status: "sold",
      soldPrice: price,
      soldAt: new Date().toISOString(),
    });
    if (updated) setItem(updated);
    setShowSoldInput(false);
  };

  const regenerateListing = async () => {
    setListingLoading(true);
    try {
      const res = await fetch("/api/thrift/generate-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, platform: "ebay" }),
      });
      const data = await res.json();
      const updated = updateItem(item.id, { generatedListing: data.listing });
      if (updated) setItem(updated);
    } catch { /* ignore */ }
    setListingLoading(false);
  };

  const handleDelete = () => {
    if (confirm("Delete this item?")) {
      deleteItem(item.id);
      router.push("/thrift");
    }
  };

  const copyListing = () => {
    if (!item.generatedListing) return;
    const text = `${item.generatedListing.title}\n\n${item.generatedListing.description}`;
    navigator.clipboard.writeText(text);
    alert("Listing copied to clipboard!");
  };

  // QR Code generator (simple canvas-based)
  const generateQR = () => {
    setShowQR(true);
    setTimeout(() => {
      if (!qrRef.current) return;
      const canvas = qrRef.current;
      const ctx = canvas.getContext("2d")!;
      const size = 200;
      canvas.width = size;
      canvas.height = size + 60;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Simple QR-like pattern (for prototype — use a real QR lib in production)
      const data = item.sku;
      ctx.fillStyle = "#1a1a2e";
      const cellSize = 8;
      const offset = 20;
      // Generate deterministic pattern from SKU
      for (let i = 0; i < data.length; i++) {
        for (let j = 0; j < data.length; j++) {
          const val = (data.charCodeAt(i % data.length) * (j + 1) + data.charCodeAt(j % data.length) * (i + 1)) % 3;
          if (val !== 0) {
            ctx.fillRect(offset + i * cellSize, offset + j * cellSize, cellSize - 1, cellSize - 1);
          }
        }
      }
      // Corner squares (QR style)
      drawCornerSquare(ctx, offset, offset, cellSize);
      drawCornerSquare(ctx, offset + (data.length - 3) * cellSize, offset, cellSize);
      drawCornerSquare(ctx, offset, offset + (data.length - 3) * cellSize, cellSize);

      // Label below
      ctx.fillStyle = "#1a1a2e";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(item.sku, size / 2, size + 20);
      ctx.font = "12px sans-serif";
      ctx.fillStyle = "#666";
      ctx.fillText(item.storageLocation || "No location", size / 2, size + 40);
      ctx.fillText(item.title.substring(0, 25), size / 2, size + 55);
    }, 100);
  };

  const printQR = () => {
    if (!qrRef.current) return;
    const dataUrl = qrRef.current.toDataURL();
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(`<html><body style="text-align:center;padding:20px"><img src="${dataUrl}" /><script>setTimeout(()=>window.print(),500)<\/script></body></html>`);
    }
  };

  const nextStatus = STATUS_FLOW[STATUS_FLOW.indexOf(item.status) + 1];
  const profit = item.soldPrice ? item.soldPrice - item.purchasePrice : null;

  return (
    <div>
      {/* Photo gallery */}
      <div style={{ display: "flex", gap: "6px", overflowX: "auto", marginBottom: "16px" }}>
        {item.photos.map((p, i) => (
          <img key={i} src={p} alt="" style={{ height: 120, borderRadius: "10px", objectFit: "cover" }} />
        ))}
      </div>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
        <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700 }}>{item.title}</h2>
        <span style={{
          fontSize: "12px", fontWeight: 600, padding: "3px 10px", borderRadius: "12px",
          background: "#1a1a2e", color: "white",
        }}>
          {STATUS_LABELS[item.status]}
        </span>
      </div>
      <p style={{ color: "#888", fontSize: "13px", margin: "0 0 16px" }}>SKU: {item.sku} · {item.storageLocation || "No location set"}</p>

      {/* Price info */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
        <PriceTag label="Paid" value={item.purchasePrice} />
        {item.listingPrice && <PriceTag label="Listed" value={item.listingPrice} color="#9c27b0" />}
        {item.soldPrice && <PriceTag label="Sold" value={item.soldPrice} color="#2e7d32" />}
        {profit !== null && (
          <PriceTag label="Profit" value={profit} color={profit >= 0 ? "#2e7d32" : "#c00"} />
        )}
      </div>

      {/* Details card */}
      <div style={cardStyle}>
        <DetailRow label="Category" value={item.category} />
        <DetailRow label="Era/Style" value={item.eraStyle} />
        <DetailRow label="Materials" value={item.materials.join(", ")} />
        <DetailRow label="Condition" value={item.condition} />
        {item.description && <DetailRow label="Notes" value={item.description} />}
        {item.aiAnalysis?.estimatedValue && (
          <DetailRow label="AI Est. Value" value={`$${item.aiAnalysis.estimatedValue.low} – $${item.aiAnalysis.estimatedValue.high}`} />
        )}
      </div>

      {/* Generated listing */}
      {item.generatedListing && (
        <div style={{ ...cardStyle, marginTop: "12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600 }}>Listing</h3>
            <button onClick={copyListing} style={smallBtnStyle}>Copy</button>
          </div>
          <p style={{ fontWeight: 600, fontSize: "14px", margin: "0 0 6px" }}>{item.generatedListing.title}</p>
          <p style={{ fontSize: "13px", color: "#555", whiteSpace: "pre-wrap", margin: 0 }}>{item.generatedListing.description}</p>
        </div>
      )}

      {/* Sold price input */}
      {showSoldInput && (
        <div style={{ ...cardStyle, marginTop: "12px" }}>
          <label style={{ fontSize: "13px", fontWeight: 600, color: "#555" }}>Sale Price ($)</label>
          <div style={{ display: "flex", gap: "8px", marginTop: "6px" }}>
            <input
              value={soldPrice}
              onChange={(e) => setSoldPrice(e.target.value)}
              type="number"
              step="0.01"
              style={{ flex: 1, padding: "10px", border: "1px solid #ddd", borderRadius: "8px", fontSize: "16px" }}
              autoFocus
            />
            <button onClick={markSold} style={{ ...actionBtnStyle, background: "#2e7d32" }}>Confirm</button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "16px" }}>
        {nextStatus && !showSoldInput && (
          <button onClick={advanceStatus} style={{ ...actionBtnStyle, background: "#1a1a2e" }}>
            Mark as {STATUS_LABELS[nextStatus]} →
          </button>
        )}

        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={regenerateListing} disabled={listingLoading} style={{ ...actionBtnStyle, background: "#555", flex: 1 }}>
            {listingLoading ? "Generating..." : "AI Listing"}
          </button>
          <button onClick={generateQR} style={{ ...actionBtnStyle, background: "#555", flex: 1 }}>
            QR Label
          </button>
        </div>

        <button onClick={handleDelete} style={{ ...actionBtnStyle, background: "#c00", fontSize: "13px" }}>
          Delete Item
        </button>
      </div>

      {/* QR Modal */}
      {showQR && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
        }}>
          <div style={{ background: "white", borderRadius: "16px", padding: "24px", textAlign: "center" }}>
            <canvas ref={qrRef} />
            <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
              <button onClick={printQR} style={{ ...actionBtnStyle, flex: 1 }}>Print</button>
              <button onClick={() => setShowQR(false)} style={{ ...actionBtnStyle, background: "#666", flex: 1 }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Back link */}
      <button onClick={() => router.push("/thrift")} style={{ marginTop: "16px", background: "none", border: "none", color: "#888", fontSize: "14px", cursor: "pointer" }}>
        ← Back to Inventory
      </button>
    </div>
  );
}

function drawCornerSquare(ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number) {
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(x, y, cellSize * 3, cellSize * 3);
  ctx.fillStyle = "white";
  ctx.fillRect(x + cellSize * 0.5, y + cellSize * 0.5, cellSize * 2, cellSize * 2);
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(x + cellSize, y + cellSize, cellSize, cellSize);
}

function PriceTag({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{
      background: "white", borderRadius: "8px", padding: "8px 12px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)", textAlign: "center",
    }}>
      <p style={{ margin: 0, fontSize: "11px", color: "#888" }}>{label}</p>
      <p style={{ margin: "2px 0 0", fontSize: "16px", fontWeight: 700, color: color || "#1a1a2e" }}>
        ${value.toFixed(0)}
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f0f0" }}>
      <span style={{ fontSize: "13px", color: "#888" }}>{label}</span>
      <span style={{ fontSize: "14px", fontWeight: 500, textAlign: "right", maxWidth: "60%" }}>{value}</span>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "white", borderRadius: "12px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
};
const actionBtnStyle: React.CSSProperties = {
  padding: "12px", background: "#1a1a2e", color: "white",
  border: "none", borderRadius: "10px", fontSize: "15px", fontWeight: 600, cursor: "pointer",
};
const smallBtnStyle: React.CSSProperties = {
  padding: "4px 12px", background: "#eee", border: "none", borderRadius: "6px",
  fontSize: "12px", fontWeight: 600, cursor: "pointer",
};
