import { useMemo } from "react";
import { scaleLinear } from "d3-scale";
import { computeScatterPoints } from "../lib/scatter";
import type { Bundle } from "../types";
import type { FitResult } from "../lib/regression";

export interface ScatterViewProps {
  bundle: Bundle;
  fit: FitResult;
  mode: "raw" | "residual";
  xFactorId: string;
  onSetXFactor: (id: string) => void;
  selectedIso3: string | null;
  onSelect: (iso3: string) => void;
  dark: boolean;
}

const W = 720;
const H = 440;
const M = { top: 16, right: 16, bottom: 48, left: 56 };

export function ScatterView(props: ScatterViewProps) {
  const { bundle, fit, mode, xFactorId, onSetXFactor, selectedIso3, onSelect, dark } = props;
  const points = useMemo(
    () => computeScatterPoints(bundle.countries, fit, mode, xFactorId),
    [bundle, fit, mode, xFactorId],
  );
  const xLabel = bundle.factors.find((f) => f.id === xFactorId)?.label ?? xFactorId;
  const yLabel = mode === "residual" ? "Unexplained fertility (residual)" : "Total fertility rate";
  const axis = dark ? "#888" : "#555";

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = scaleLinear()
    .domain([Math.min(0, ...xs), Math.max(0, ...xs)])
    .range([M.left, W - M.right])
    .nice();
  const y = scaleLinear()
    .domain([Math.min(...ys, 0), Math.max(...ys, 0)])
    .range([H - M.bottom, M.top])
    .nice();

  return (
    <div>
      <label style={{ fontSize: 13 }}>
        X-axis:{" "}
        <select value={xFactorId} onChange={(e) => onSetXFactor(e.target.value)} aria-label="X-axis factor">
          {bundle.factors.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>
      </label>
      {points.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.7 }}>No countries have data for this factor in this mode.</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Scatter of ${yLabel} versus ${xLabel}`}>
          {y.ticks(5).map((t) => (
            <g key={`y${t}`}>
              <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke={axis} strokeOpacity={0.15} />
              <text x={M.left - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill={axis}>{t}</text>
            </g>
          ))}
          {x.ticks(6).map((t) => (
            <text key={`x${t}`} x={x(t)} y={H - M.bottom + 16} textAnchor="middle" fontSize={10} fill={axis}>{t}</text>
          ))}
          {points.map((p) => {
            const selected = p.iso3 === selectedIso3;
            return (
              <circle
                key={p.iso3}
                cx={x(p.x)}
                cy={y(p.y)}
                r={selected ? 6 : 3.5}
                fill={selected ? (dark ? "#fff" : "#111") : dark ? "#5ba3d0" : "#378add"}
                fillOpacity={0.75}
                stroke={selected ? (dark ? "#fff" : "#111") : "none"}
                strokeWidth={selected ? 2 : 0}
                style={{ cursor: "pointer" }}
                onClick={() => onSelect(p.iso3)}
              >
                <title>{p.name}</title>
              </circle>
            );
          })}
          <text x={(M.left + W - M.right) / 2} y={H - 6} textAnchor="middle" fontSize={12} fill={axis}>{xLabel}</text>
          <text x={-(H / 2)} y={14} transform="rotate(-90)" textAnchor="middle" fontSize={12} fill={axis}>{yLabel}</text>
        </svg>
      )}
    </div>
  );
}
