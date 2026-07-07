import { useMemo } from "react";
import { geoNaturalEarth1, geoAlbersUsa, geoPath } from "d3-geo";
import { featuresFromTopo } from "../lib/geo";
import { rawColor, residualColor, INSUFFICIENT_COLOR } from "../lib/scales";
import type { Country } from "../types";
import type { FitResult } from "../lib/regression";
import type { Policy } from "../lib/policy";

export interface MapViewProps {
  topo: unknown;
  byIsoNum: Map<number, Country>;
  fit: FitResult;
  mode: "raw" | "residual";
  selectedIso3: string | null;
  onSelect: (iso3: string) => void;
  dark: boolean;
  projectionKind?: "world" | "albersUsa";
  objectName?: string;
  policyByIsoNum?: Map<number, Policy>;
  policyOn?: boolean;
}

const W = 880;
const H = 440;

function maxAbsResidual(fit: FitResult): number {
  const abs = [...fit.fits.values()].map((f) => Math.abs(f.residualTfr)).sort((a, b) => a - b);
  if (abs.length === 0) return 1.5;
  const p95 = abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.95))];
  return Math.max(0.5, p95);
}

export function MapView(props: MapViewProps) {
  const { topo, byIsoNum, fit, mode, selectedIso3, onSelect, dark,
          projectionKind = "world", objectName = "countries", policyByIsoNum, policyOn } = props;
  const features = useMemo(
    () => featuresFromTopo(topo, objectName, projectionKind === "world" ? "Antarctica" : undefined),
    [topo, objectName, projectionKind],
  );
  const path = useMemo(() => {
    const base = projectionKind === "albersUsa" ? geoAlbersUsa() : geoNaturalEarth1();
    const projection = base.fitSize([W, H], { type: "FeatureCollection", features } as any);
    return geoPath(projection);
  }, [features, projectionKind]);
  const maxAbs = maxAbsResidual(fit);

  const fillFor = (isoNum: number): string => {
    const c = byIsoNum.get(isoNum);
    if (!c) return INSUFFICIENT_COLOR(dark);
    if (mode === "raw") return c.tfr == null ? INSUFFICIENT_COLOR(dark) : rawColor(c.tfr, dark);
    const f = fit.fits.get(c.iso3);
    return f ? residualColor(f.residualTfr, maxAbs, dark) : INSUFFICIENT_COLOR(dark);
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="World choropleth of fertility">
      <defs>
        <pattern id="policy-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={dark ? "#fff" : "#111"} strokeWidth="1.3" strokeOpacity="0.55" />
        </pattern>
      </defs>
      {features.map((feat, i) => {
        const isoNum = Number(feat.id);
        const c = byIsoNum.get(isoNum);
        const selected = c != null && c.iso3 === selectedIso3;
        return (
          <path
            key={feat.id != null ? String(feat.id) : `noid-${i}`}
            d={path(feat as any) ?? undefined}
            fill={fillFor(isoNum)}
            stroke={selected ? (dark ? "#fff" : "#111") : dark ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.85)"}
            strokeWidth={selected ? 1.4 : 0.4}
            style={{ cursor: c ? "pointer" : "default" }}
            onClick={() => c && onSelect(c.iso3)}
          />
        );
      })}
      {policyOn && policyByIsoNum && features.map((feat, i) => {
        const p = policyByIsoNum.get(Number(feat.id));
        if (!p || p.stance !== "raise") return null;
        return (
          <path
            key={`pol-${feat.id != null ? String(feat.id) : i}`}
            d={path(feat as any) ?? undefined}
            fill="url(#policy-hatch)"
            stroke="none"
            pointerEvents="none"
          />
        );
      })}
    </svg>
  );
}
