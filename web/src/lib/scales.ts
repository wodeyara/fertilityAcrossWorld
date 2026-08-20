import { scaleSequential, scaleDiverging } from "d3-scale";
import { interpolateRdBu, interpolateYlGnBu } from "d3-scale-chromatic";
import { rgb } from "d3-color";

const toHex = (c: string) => rgb(c).formatHex();

// Fixed residual color-scale half-range (births/woman vs. predicted). The scale is
// deliberately independent of the fitted model, so the colorbar keeps a stable
// meaning as factors are toggled; residuals beyond ±RESIDUAL_MAX saturate.
export const RESIDUAL_MAX = 0.5;

// Residuals within this fraction of RESIDUAL_MAX render as a neutral grey in dark
// mode — too close to zero to distinguish hue perceptually against a dark background.
const DARK_NEUTRAL_BAND = 0.08;
const DARK_NEUTRAL = "#4a4c50";

// rawColor has a fixed domain, so build its scale once.
const rawScale = scaleSequential<string>(interpolateYlGnBu).domain([0.8, 7]).clamp(true);

// The residual scale is fixed (±RESIDUAL_MAX), so build it once.
const residualScale = scaleDiverging<string>((t) => interpolateRdBu(1 - t))
  .domain([-RESIDUAL_MAX, 0, RESIDUAL_MAX])
  .clamp(true);

// RdBu reversed: positive residual -> red (interpolateRdBu(0)), negative -> blue (interpolateRdBu(1)).
export function residualColor(residual: number, dark: boolean): string {
  if (dark && Math.abs(residual) < RESIDUAL_MAX * DARK_NEUTRAL_BAND) return DARK_NEUTRAL;
  return toHex(residualScale(residual));
}

export function rawColor(tfr: number, _dark: boolean): string {
  return toHex(rawScale(tfr));
}

export function INSUFFICIENT_COLOR(dark: boolean): string {
  return dark ? "#2c2e31" : "#e4e7ea";
}

export function residualLegendStops(): { value: number; color: string }[] {
  // 13 evenly-spaced grades spanning the fixed ±RESIDUAL_MAX domain (6 per side + centre).
  const n = 13;
  return Array.from({ length: n }, (_, i) => {
    const value = -RESIDUAL_MAX + (i * (2 * RESIDUAL_MAX)) / (n - 1);
    return { value, color: residualColor(value, false) };
  });
}

export function rawLegendStops(): { value: number; color: string }[] {
  return [0.8, 1.5, 2.3, 3.3, 4.5, 6, 7].map((value) => ({ value, color: rawColor(value, false) }));
}
