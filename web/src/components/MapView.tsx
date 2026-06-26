import { useMemo } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { featuresFromTopo } from "../lib/geo";
import { rawColor, residualColor, INSUFFICIENT_COLOR } from "../lib/scales";
import type { Country } from "../types";
import type { FitResult } from "../lib/regression";

export interface MapViewProps {
  topo: unknown;
  byIsoNum: Map<number, Country>;
  fit: FitResult;
  mode: "raw" | "residual";
  selectedIso3: string | null;
  onSelect: (iso3: string) => void;
  dark: boolean;
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
  const { topo, byIsoNum, fit, mode, selectedIso3, onSelect, dark } = props;
  const features = useMemo(() => featuresFromTopo(topo), [topo]);
  const path = useMemo(() => {
    const projection = geoNaturalEarth1().fitSize([W, H], { type: "FeatureCollection", features } as any);
    return geoPath(projection);
  }, [features]);
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
    </svg>
  );
}
