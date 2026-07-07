import { residualLegendStops, rawLegendStops } from "../lib/scales";

export function Legend({ mode, policyOn }: { mode: "raw" | "residual"; policyOn?: boolean }) {
  const stops = mode === "residual" ? residualLegendStops() : rawLegendStops();
  const left = mode === "residual" ? "lower than expected" : "0.8";
  const right = mode === "residual" ? "higher than expected" : "7+";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 6 }}>
        <span>{left}</span>
        <div style={{ display: "flex", flex: 1, borderRadius: 3, overflow: "hidden" }}>
          {stops.map((s) => (
            <div key={s.value} style={{ flex: 1, height: 12, background: s.color }} />
          ))}
        </div>
        <span>{right}</span>
      </div>
      {policyOn && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 6 }}>
          <svg width="18" height="12" aria-hidden="true">
            <defs>
              <pattern id="policy-hatch-legend" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.7" />
              </pattern>
            </defs>
            <rect width="18" height="12" fill="url(#policy-hatch-legend)" stroke="rgba(128,128,128,0.5)" />
          </svg>
          <span>Pronatalist policy (raising fertility)</span>
        </div>
      )}
    </div>
  );
}
