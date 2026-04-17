"use client";

// ── Lightweight SVG Chart Components ──────────────────────────
// Zero dependencies. Uses CSS vars for theming.

// ── Sparkline ─────────────────────────────────────────────────
// Mini line chart. Usage: <Sparkline data={[100, 200, 150, 300]} />
export function Sparkline({ data, width = 120, height = 32, color = "var(--zr-orange)", fillColor }: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
}) {
  if (data.length < 2) return null;
  const pad = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (data.length - 1);

  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = height - pad - ((v - min) / range) * (height - pad * 2);
    return `${x},${y}`;
  }).join(" ");

  const fillPoints = `${pad},${height - pad} ${points} ${pad + (data.length - 1) * stepX},${height - pad}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {fillColor && (
        <polygon points={fillPoints} fill={fillColor} opacity={0.15} />
      )}
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      {data.length > 0 && (() => {
        const lastX = pad + (data.length - 1) * stepX;
        const lastY = height - pad - ((data[data.length - 1] - min) / range) * (height - pad * 2);
        return <circle cx={lastX} cy={lastY} r={2.5} fill={color} />;
      })()}
    </svg>
  );
}


// ── Mini Bar Chart ────────────────────────────────────────────
// Usage: <MiniBarChart bars={[{label:"Jan",value:5000},{label:"Feb",value:8000}]} />
export function MiniBarChart({ bars, width = 220, height = 80, color = "var(--zr-orange)" }: {
  bars: { label: string; value: number; color?: string }[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (bars.length === 0) return null;
  const max = Math.max(...bars.map(b => b.value));
  const barWidth = Math.min(24, (width - 8) / bars.length - 4);
  const labelHeight = 16;
  const chartH = height - labelHeight;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }}>
      {bars.map((b, i) => {
        const barH = max > 0 ? (b.value / max) * (chartH - 4) : 0;
        const x = 4 + i * ((width - 8) / bars.length) + ((width - 8) / bars.length - barWidth) / 2;
        const y = chartH - barH;
        return (
          <g key={i}>
            <rect
              x={x} y={y} width={barWidth} height={barH}
              rx={3} fill={b.color || color} opacity={0.85}
            />
            <text
              x={x + barWidth / 2} y={height - 2}
              textAnchor="middle" fill="var(--zr-text-muted)"
              fontSize={9} fontFamily="var(--zr-font-mono)"
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}


// ── Pipeline Funnel ───────────────────────────────────────────
// Horizontal funnel with shrinking bars.
// Usage: <PipelineFunnel stages={[{label:"New",count:10,value:50000},...]} />
export function PipelineFunnel({ stages, height = 28 }: {
  stages: { label: string; count: number; value?: number; color: string }[];
  height?: number;
}) {
  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {stages.filter(s => s.count > 0).map((s, i) => {
        const pct = Math.max(8, (s.count / maxCount) * 100);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{
              width: `${pct}%`,
              minWidth: 40,
              height: `${height}px`,
              background: s.color,
              borderRadius: "var(--zr-radius-sm)",
              display: "flex",
              alignItems: "center",
              padding: "0 8px",
              transition: "width 0.3s ease",
            }}>
              <span style={{ color: "#fff", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}>
                {s.count}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0 }}>
              <span style={{ fontSize: "11px", color: "var(--zr-text-secondary)", whiteSpace: "nowrap" }}>{s.label}</span>
              {s.value !== undefined && s.value > 0 && (
                <span style={{ fontSize: "10px", color: "var(--zr-success)", fontWeight: 500, fontFamily: "var(--zr-font-mono)" }}>
                  ${s.value >= 1000 ? (s.value / 1000).toFixed(1) + "k" : s.value.toFixed(0)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ── Donut Chart ───────────────────────────────────────────────
// Mini donut with center label. Usage: <DonutChart value={75} label="75%" />
export function DonutChart({ value, max = 100, size = 64, strokeWidth = 8, color = "var(--zr-orange)", label }: {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(value / max, 1);
  const offset = circumference * (1 - pct);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--zr-surface-3)" strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      {label && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "11px", fontWeight: 700, color: "var(--zr-text-primary)",
          fontFamily: "var(--zr-font-mono)",
        }}>
          {label}
        </div>
      )}
    </div>
  );
}


// ── Stat Trend ────────────────────────────────────────────────
// Number with sparkline and trend indicator.
export function StatTrend({ label, value, trend, data, format = "number" }: {
  label: string;
  value: number;
  trend: number; // percent change
  data?: number[];
  format?: "number" | "currency" | "percent";
}) {
  const formatted = format === "currency"
    ? `$${value >= 1000 ? (value / 1000).toFixed(1) + "k" : value.toLocaleString()}`
    : format === "percent"
    ? `${value.toFixed(0)}%`
    : value.toLocaleString();

  const trendColor = trend > 0 ? "var(--zr-success)" : trend < 0 ? "var(--zr-error)" : "var(--zr-text-muted)";
  const trendIcon = trend > 0 ? "↑" : trend < 0 ? "↓" : "→";

  return (
    <div style={{
      background: "var(--zr-surface-1)",
      border: "1px solid var(--zr-border)",
      borderRadius: "var(--zr-radius-md)",
      padding: "12px",
    }}>
      <div style={{ fontSize: "11px", color: "var(--zr-text-muted)", fontFamily: "var(--zr-font-mono)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "var(--zr-text-primary)" }}>{formatted}</div>
          <div style={{ fontSize: "11px", color: trendColor, fontWeight: 500, marginTop: "2px" }}>
            {trendIcon} {Math.abs(trend).toFixed(0)}% vs last period
          </div>
        </div>
        {data && data.length >= 2 && (
          <Sparkline data={data} width={80} height={28} color={trend >= 0 ? "var(--zr-success)" : "var(--zr-error)"} fillColor={trend >= 0 ? "var(--zr-success)" : "var(--zr-error)"} />
        )}
      </div>
    </div>
  );
}
