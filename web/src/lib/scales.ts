import { scaleSequential, scaleDiverging } from "d3-scale";
import { interpolateRdBu, interpolateYlGnBu } from "d3-scale-chromatic";
import { rgb } from "d3-color";

const toHex = (c: string) => rgb(c).formatHex();

// Residuals within this fraction of maxAbs render as a neutral grey in dark mode —
// too close to zero to distinguish hue perceptually against a dark background.
const DARK_NEUTRAL_BAND = 0.08;
const DARK_NEUTRAL = "#4a4c50";

// rawColor has a fixed domain, so build its scale once.
const rawScale = scaleSequential<string>(interpolateYlGnBu).domain([0.8, 7]).clamp(true);

// residualColor's scale depends on maxAbs; memoize per distinct maxAbs to avoid
// rebuilding it for every country on each map render.
const residualScaleCache = new Map<number, (v: number) => string>();
function residualScale(maxAbs: number): (v: number) => string {
  let s = residualScaleCache.get(maxAbs);
  if (!s) {
    s = scaleDiverging<string>((t) => interpolateRdBu(1 - t)).domain([-maxAbs, 0, maxAbs]).clamp(true);
    residualScaleCache.set(maxAbs, s);
  }
  return s;
}

// RdBu reversed: positive residual -> red (interpolateRdBu(0)), negative -> blue (interpolateRdBu(1)).
export function residualColor(residual: number, maxAbs: number, dark: boolean): string {
  if (dark && Math.abs(residual) < maxAbs * DARK_NEUTRAL_BAND) return DARK_NEUTRAL;
  return toHex(residualScale(maxAbs)(residual));
}

export function rawColor(tfr: number, _dark: boolean): string {
  return toHex(rawScale(tfr));
}

export function INSUFFICIENT_COLOR(dark: boolean): string {
  return dark ? "#2c2e31" : "#e4e7ea";
}

export function residualLegendStops(): { value: number; color: string }[] {
  const maxAbs = 1.5;
  return [-1.5, -0.9, -0.3, 0, 0.3, 0.9, 1.5].map((value) => ({
    value,
    color: residualColor(value, maxAbs, false),
  }));
}

export function rawLegendStops(): { value: number; color: string }[] {
  return [0.8, 1.5, 2.3, 3.3, 4.5, 6, 7].map((value) => ({ value, color: rawColor(value, false) }));
}
