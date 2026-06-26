import { residualLegendStops, rawLegendStops } from "../lib/scales";

export function Legend({ mode }: { mode: "raw" | "residual" }) {
  const stops = mode === "residual" ? residualLegendStops() : rawLegendStops();
  const left = mode === "residual" ? "lower than expected" : "0.8";
  const right = mode === "residual" ? "higher than expected" : "7+";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 6 }}>
      <span>{left}</span>
      <div style={{ display: "flex", flex: 1, borderRadius: 3, overflow: "hidden" }}>
        {stops.map((s) => (
          <div key={s.value} style={{ flex: 1, height: 12, background: s.color }} />
        ))}
      </div>
      <span>{right}</span>
    </div>
  );
}
