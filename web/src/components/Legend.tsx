import { residualLegendStops, rawLegendStops } from "../lib/scales";

export function Legend({ mode, policyOn }: { mode: "raw" | "residual"; policyOn?: boolean }) {
  const stops = mode === "residual" ? residualLegendStops() : rawLegendStops();
  const bar = (
    <div style={{ display: "flex", flex: 1, borderRadius: 3, overflow: "hidden" }}>
      {stops.map((s) => (
        <div key={s.value} style={{ flex: 1, height: 12, background: s.color }} />
      ))}
    </div>
  );
  return (
    <div>
      {mode === "raw" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 6 }}>
          <span>0.8</span>
          {bar}
          <span>7+</span>
        </div>
      ) : (
        <div style={{ fontSize: 11, marginTop: 6 }}>
          {bar}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
            <span>≤ -0.5</span>
            <span>-0.25</span>
            <span>0</span>
            <span>+0.25</span>
            <span>≥ +0.5</span>
          </div>
          <div style={{ opacity: 0.6, marginTop: 2 }}>residual vs. predicted (births/woman)</div>
        </div>
      )}
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
