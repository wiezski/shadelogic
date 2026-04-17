"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createItem } from "@/lib/thrift-store";
import { AIAnalysis, CATEGORIES, ERA_STYLES, STORAGE_ROWS, STORAGE_SHELVES } from "@/lib/thrift-types";

type Step = "photos" | "analyzing" | "review" | "details" | "listing" | "done";

export default function AddItemPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("photos");
  const [photos, setPhotos] = useState<string[]>([]);
  const [userNotes, setUserNotes] = useState("");
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [error, setError] = useState("");

  // Form fields (pre-filled by AI)
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [eraStyle, setEraStyle] = useState("");
  const [materials, setMaterials] = useState("");
  const [condition, setCondition] = useState<"excellent" | "good" | "fair" | "poor" | "as-is">("good");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [storageRow, setStorageRow] = useState("A");
  const [storageShelf, setStorageShelf] = useState("1");
  const [storageSide, setStorageSide] = useState("Left");
  const [description, setDescription] = useState("");

  // Listing
  const [generatedListing, setGeneratedListing] = useState<Record<string, unknown> | null>(null);
  const [listingLoading, setListingLoading] = useState(false);

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        // Resize for storage efficiency
        resizeImage(result, 800, (resized) => {
          setPhotos((prev) => [...prev, resized]);
        });
      };
      reader.readAsDataURL(file);
    });
  };

  const resizeImage = (dataUrl: string, maxWidth: number, callback: (resized: string) => void) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const ratio = Math.min(maxWidth / img.width, maxWidth / img.height);
      canvas.width = img.width * ratio;
      canvas.height = img.height * ratio;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      callback(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.src = dataUrl;
  };

  const removePhoto = (idx: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  };

  const runAnalysis = async () => {
    setStep("analyzing");
    setError("");
    try {
      const res = await fetch("/api/thrift/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos, userNotes }),
      });
      const data = await res.json();
      if (data.analysis) {
        setAnalysis(data.analysis);
        setIsMock(data.mock);
        // Pre-fill form fields from AI
        setTitle(data.analysis.itemType || "");
        setCategory(data.analysis.suggestedCategory || "Other");
        setEraStyle(data.analysis.eraStyle || "");
        setMaterials((data.analysis.materials || []).join(", "));
        setCondition(mapCondition(data.analysis.condition));
        setDescription(data.analysis.notes || "");
        setStep("review");
      } else {
        setError("Analysis failed");
        setStep("photos");
      }
    } catch (err) {
      console.error(err);
      setError("Failed to analyze — check connection");
      setStep("photos");
    }
  };

  const mapCondition = (text: string): "excellent" | "good" | "fair" | "poor" | "as-is" => {
    const lower = (text || "").toLowerCase();
    if (lower.includes("excellent") || lower.includes("mint") || lower.includes("perfect")) return "excellent";
    if (lower.includes("fair") || lower.includes("wear")) return "fair";
    if (lower.includes("poor") || lower.includes("damage")) return "poor";
    if (lower.includes("as-is") || lower.includes("parts")) return "as-is";
    return "good";
  };

  const generateListing = async () => {
    setListingLoading(true);
    try {
      const res = await fetch("/api/thrift/generate-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item: { title, category, eraStyle, materials: materials.split(",").map((m) => m.trim()), condition, description, aiAnalysis: analysis },
          platform: "ebay",
        }),
      });
      const data = await res.json();
      setGeneratedListing(data.listing);
    } catch {
      setError("Failed to generate listing");
    }
    setListingLoading(false);
  };

  const saveItem = () => {
    const item = createItem({
      title,
      category,
      eraStyle,
      materials: materials.split(",").map((m) => m.trim()),
      condition,
      purchasePrice: parseFloat(purchasePrice) || 0,
      storageLocation: `${storageRow}${storageShelf}-${storageSide}`,
      description,
      photos,
      aiAnalysis: analysis,
      listingPrice: generatedListing ? (generatedListing.suggestedPrice as { mid: number })?.mid : null,
      generatedListing: generatedListing as unknown as import("@/lib/thrift-types").GeneratedListing | null,
      status: generatedListing ? "listed" : "photographed",
    });
    router.push(`/thrift/${item.id}`);
  };

  // ─── RENDER ─────────────────────────────────────────────

  // Photo capture step
  if (step === "photos") {
    return (
      <div>
        <h2 style={h2Style}>Add New Item</h2>

        {/* Photo grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "16px" }}>
          {photos.map((photo, idx) => (
            <div key={idx} style={{ position: "relative", aspectRatio: "1", borderRadius: "8px", overflow: "hidden" }}>
              <img src={photo} alt={`Photo ${idx + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button
                onClick={() => removePhoto(idx)}
                style={{
                  position: "absolute", top: 4, right: 4,
                  background: "rgba(0,0,0,0.6)", color: "white",
                  border: "none", borderRadius: "50%", width: 28, height: 28,
                  cursor: "pointer", fontSize: "14px",
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {photos.length < 6 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                aspectRatio: "1", borderRadius: "8px",
                border: "2px dashed #ccc", background: "white",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                cursor: "pointer", color: "#888", fontSize: "14px",
              }}
            >
              <span style={{ fontSize: "32px", marginBottom: "4px" }}>📷</span>
              Add Photo
            </button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={handlePhotoCapture}
          style={{ display: "none" }}
        />

        {/* Quick notes */}
        <textarea
          value={userNotes}
          onChange={(e) => setUserNotes(e.target.value)}
          placeholder="Quick notes (optional) — e.g. 'brass, heavy, has label on bottom, paid $8'"
          style={textareaStyle}
          rows={2}
        />

        {error && <p style={{ color: "#c00", fontSize: "14px" }}>{error}</p>}

        <button
          onClick={runAnalysis}
          disabled={photos.length === 0}
          style={{
            ...buttonStyle,
            background: photos.length === 0 ? "#ccc" : "#1a1a2e",
            cursor: photos.length === 0 ? "not-allowed" : "pointer",
            marginTop: "12px",
          }}
        >
          Analyze with AI ({photos.length} photo{photos.length !== 1 ? "s" : ""})
        </button>
      </div>
    );
  }

  // Analyzing step
  if (step === "analyzing") {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px", animation: "spin 1s linear infinite" }}>🔍</div>
        <h2 style={h2Style}>Analyzing your item...</h2>
        <p style={{ color: "#666", fontSize: "14px" }}>AI is identifying the era, materials, condition, and value</p>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Review AI analysis
  if (step === "review") {
    return (
      <div>
        <h2 style={h2Style}>AI Analysis</h2>
        {isMock && (
          <div style={{ background: "#fff3cd", border: "1px solid #ffc107", borderRadius: "8px", padding: "10px", marginBottom: "12px", fontSize: "13px" }}>
            Demo mode — set ANTHROPIC_API_KEY in .env.local for real analysis
          </div>
        )}

        {/* Photo strip */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "16px", overflowX: "auto" }}>
          {photos.map((p, i) => (
            <img key={i} src={p} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: "6px" }} />
          ))}
        </div>

        {analysis && (
          <div style={{ background: "white", borderRadius: "12px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            <div style={fieldRow}><span style={labelS}>Item</span><span style={valueS}>{analysis.itemType}</span></div>
            <div style={fieldRow}><span style={labelS}>Era/Style</span><span style={valueS}>{analysis.eraStyle}</span></div>
            <div style={fieldRow}><span style={labelS}>Materials</span><span style={valueS}>{analysis.materials?.join(", ")}</span></div>
            <div style={fieldRow}><span style={labelS}>Condition</span><span style={valueS}>{analysis.condition}</span></div>
            <div style={fieldRow}><span style={labelS}>Maker Marks</span><span style={valueS}>{analysis.makerMarks}</span></div>
            <div style={fieldRow}>
              <span style={labelS}>Est. Value</span>
              <span style={{ ...valueS, fontWeight: 700, color: "#2e7d32" }}>
                ${analysis.estimatedValue?.low} – ${analysis.estimatedValue?.high}
              </span>
            </div>
            <div style={fieldRow}><span style={labelS}>Confidence</span><span style={valueS}>{Math.round((analysis.confidence || 0) * 100)}%</span></div>
            {analysis.notes && (
              <p style={{ fontSize: "13px", color: "#555", marginTop: "8px", fontStyle: "italic" }}>{analysis.notes}</p>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
          <button onClick={() => setStep("photos")} style={{ ...buttonStyle, background: "#666", flex: 1 }}>Re-take</button>
          <button onClick={() => setStep("details")} style={{ ...buttonStyle, flex: 2 }}>Looks Good →</button>
        </div>
      </div>
    );
  }

  // Detail editing step
  if (step === "details") {
    return (
      <div>
        <h2 style={h2Style}>Item Details</h2>
        <p style={{ color: "#888", fontSize: "13px", marginBottom: "16px" }}>Pre-filled by AI — edit anything</p>

        <div style={formCard}>
          <label style={labelStyle}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <label style={labelStyle}>Era / Style</label>
          <select value={eraStyle} onChange={(e) => setEraStyle(e.target.value)} style={inputStyle}>
            <option value="">Select...</option>
            {ERA_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <label style={labelStyle}>Materials (comma separated)</label>
          <input value={materials} onChange={(e) => setMaterials(e.target.value)} style={inputStyle} />

          <label style={labelStyle}>Condition</label>
          <select value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)} style={inputStyle}>
            <option value="excellent">Excellent</option>
            <option value="good">Good</option>
            <option value="fair">Fair</option>
            <option value="poor">Poor</option>
            <option value="as-is">As-Is</option>
          </select>

          <label style={labelStyle}>Purchase Price ($)</label>
          <input value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} type="number" step="0.01" style={inputStyle} placeholder="What she paid" />

          <label style={labelStyle}>Storage Location</label>
          <div style={{ display: "flex", gap: "8px" }}>
            <select value={storageRow} onChange={(e) => setStorageRow(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              {STORAGE_ROWS.map((r) => <option key={r} value={r}>Row {r}</option>)}
            </select>
            <select value={storageShelf} onChange={(e) => setStorageShelf(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              {STORAGE_SHELVES.map((s) => <option key={s} value={String(s)}>Shelf {s}</option>)}
            </select>
            <select value={storageSide} onChange={(e) => setStorageSide(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
              <option value="Left">Left</option>
              <option value="Center">Center</option>
              <option value="Right">Right</option>
            </select>
          </div>

          <label style={labelStyle}>Notes</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} style={textareaStyle} rows={3} />
        </div>

        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
          <button onClick={() => setStep("review")} style={{ ...buttonStyle, background: "#666", flex: 1 }}>← Back</button>
          <button onClick={() => { setStep("listing"); generateListing(); }} style={{ ...buttonStyle, flex: 2 }}>Generate Listing →</button>
        </div>

        <button onClick={saveItem} style={{ ...buttonStyle, background: "#555", marginTop: "8px", fontSize: "13px" }}>
          Save without listing (inventory only)
        </button>
      </div>
    );
  }

  // Listing generation step
  if (step === "listing") {
    return (
      <div>
        <h2 style={h2Style}>Generated Listing</h2>

        {listingLoading && (
          <div style={{ textAlign: "center", padding: "40px" }}>
            <p style={{ color: "#666" }}>Writing your listing...</p>
          </div>
        )}

        {generatedListing && !listingLoading && (
          <div style={formCard}>
            <label style={labelStyle}>Listing Title</label>
            <input
              value={(generatedListing.title as string) || ""}
              onChange={(e) => setGeneratedListing({ ...generatedListing, title: e.target.value })}
              style={inputStyle}
            />

            <label style={labelStyle}>Description</label>
            <textarea
              value={(generatedListing.description as string) || ""}
              onChange={(e) => setGeneratedListing({ ...generatedListing, description: e.target.value })}
              style={textareaStyle}
              rows={8}
            />

            <label style={labelStyle}>Keywords</label>
            <p style={{ fontSize: "13px", color: "#555" }}>
              {((generatedListing.keywords as string[]) || []).join(", ")}
            </p>

            <label style={labelStyle}>Suggested Price</label>
            <div style={{ display: "flex", gap: "12px", fontSize: "14px" }}>
              <span>Low: <b>${(generatedListing.suggestedPrice as { low: number })?.low}</b></span>
              <span>Mid: <b style={{ color: "#2e7d32" }}>${(generatedListing.suggestedPrice as { mid: number })?.mid}</b></span>
              <span>High: <b>${(generatedListing.suggestedPrice as { high: number })?.high}</b></span>
            </div>
          </div>
        )}

        {error && <p style={{ color: "#c00" }}>{error}</p>}

        <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
          <button onClick={() => setStep("details")} style={{ ...buttonStyle, background: "#666", flex: 1 }}>← Edit Details</button>
          <button onClick={saveItem} style={{ ...buttonStyle, flex: 2, background: "#2e7d32" }}>Save Item ✓</button>
        </div>
      </div>
    );
  }

  return null;
}

// ─── Styles ─────────────────────────────────────────────
const h2Style: React.CSSProperties = { fontSize: "20px", fontWeight: 700, margin: "0 0 16px", color: "#1a1a2e" };
const buttonStyle: React.CSSProperties = {
  width: "100%", padding: "14px", background: "#1a1a2e", color: "white",
  border: "none", borderRadius: "10px", fontSize: "16px", fontWeight: 600, cursor: "pointer",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid #ddd", borderRadius: "8px",
  fontSize: "15px", marginBottom: "12px", boxSizing: "border-box",
};
const textareaStyle: React.CSSProperties = { ...inputStyle, resize: "vertical" };
const labelStyle: React.CSSProperties = { display: "block", fontSize: "13px", fontWeight: 600, color: "#555", marginBottom: "4px" };
const formCard: React.CSSProperties = { background: "white", borderRadius: "12px", padding: "16px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" };
const fieldRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #f0f0f0" };
const labelS: React.CSSProperties = { fontSize: "13px", color: "#888" };
const valueS: React.CSSProperties = { fontSize: "14px", fontWeight: 500, textAlign: "right" };
