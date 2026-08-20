import type { FactorMeta } from "../types";
import { toggleButtonStyle } from "../lib/ui";

export interface ControlPanelProps {
  factors: FactorMeta[];
  selected: Set<string>;
  onToggleFactor: (id: string) => void;
  mode: "raw" | "residual";
  onSetMode: (mode: "raw" | "residual") => void;
  r2: number | null;
  n: number;
  unitNoun?: string;
  policyOn?: boolean;
  onSetPolicy?: (v: boolean) => void;
}

export function ControlPanel(props: ControlPanelProps) {
  const { factors, selected, onToggleFactor, mode, onSetMode, r2, n, unitNoun = "countries", policyOn, onSetPolicy } = props;
  const groups = [...new Set(factors.map((f) => f.group))];

  return (
    <aside style={{ width: 230, fontSize: 13 }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        <button aria-pressed={mode === "residual"} onClick={() => onSetMode("residual")}
          style={toggleButtonStyle(mode === "residual")}>Unexplained (residual)</button>
        <button aria-pressed={mode === "raw"} onClick={() => onSetMode("raw")}
          style={toggleButtonStyle(mode === "raw")}>Raw fertility</button>
      </div>
      {onSetPolicy && (
        <label style={{ display: "block", marginBottom: 12, fontSize: 13 }}>
          <input
            type="checkbox"
            aria-label="Pronatalist policy"
            checked={!!policyOn}
            onChange={(e) => onSetPolicy(e.target.checked)}
          />{" "}
          Pronatalist policy overlay
        </label>
      )}
      <div style={{ marginBottom: 12 }}>
        <span>explains </span>
        <strong data-testid="r2-readout">{r2 == null ? "—" : `${Math.round(r2 * 100)}%`}</strong>
        <span> of variation ({n} {unitNoun})</span>
      </div>
      <strong>Control for…</strong>
      {groups.map((group) => (
        <fieldset key={group} style={{ border: "none", padding: 0, margin: "8px 0" }}>
          <legend style={{ textTransform: "uppercase", fontSize: 11, opacity: 0.7 }}>{group}</legend>
          {factors.filter((f) => f.group === group).map((f) => (
            <label key={f.id} style={{ display: "block" }}>
              <input
                type="checkbox"
                aria-label={f.label}
                checked={selected.has(f.id)}
                onChange={() => onToggleFactor(f.id)}
              />{" "}
              {f.label}
              {f.transform === "log" && <span style={{ opacity: 0.6 }}> (log)</span>}
              {f.quadratic && (
                <span style={{ marginLeft: 4, fontSize: 10, padding: "0 4px", borderRadius: 4, background: "#8ecae644", color: "inherit" }}>curve</span>
              )}
              {f.group === "Possibility" && (
                <span style={{ marginLeft: 4, fontSize: 10, padding: "0 4px", borderRadius: 4, background: "#f0c98044", color: "inherit" }}>exp</span>
              )}
            </label>
          ))}
        </fieldset>
      ))}
    </aside>
  );
}
