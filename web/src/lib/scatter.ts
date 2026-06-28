import type { Country } from "../types";
import type { FitResult } from "./regression";

export interface ScatterPoint {
  iso3: string;
  name: string;
  x: number;
  y: number;
}

export function computeScatterPoints(
  countries: Country[],
  fit: FitResult,
  mode: "raw" | "residual",
  xFactorId: string,
): ScatterPoint[] {
  const points: ScatterPoint[] = [];
  for (const c of countries) {
    const x = c.factors[xFactorId];
    if (x == null) continue;
    let y: number | null;
    if (mode === "residual") {
      const f = fit.fits.get(c.iso3);
      y = f ? f.residualTfr : null;
    } else {
      y = c.tfr;
    }
    if (y == null) continue;
    points.push({ iso3: c.iso3, name: c.name, x, y });
  }
  return points;
}
