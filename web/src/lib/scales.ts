import { scaleSequential, scaleDiverging } from "d3-scale";
import { interpolateRdBu, interpolateYlGnBu } from "d3-scale-chromatic";
import { rgb } from "d3-color";

const toHex = (c: string) => rgb(c).formatHex();

// RdBu reversed: positive residual -> red (interpolateRdBu(0)), negative -> blue (interpolateRdBu(1)).
export function residualColor(residual: number, maxAbs: number, dark: boolean): string {
  if (dark && Math.abs(residual) < maxAbs * 0.08) return "#4a4c50"; // neutral grey center in dark mode
  const s = scaleDiverging<string>((t) => interpolateRdBu(1 - t)).domain([-maxAbs, 0, maxAbs]).clamp(true);
  return toHex(s(residual));
}

export function rawColor(tfr: number, _dark: boolean): string {
  const s = scaleSequential<string>(interpolateYlGnBu).domain([0.8, 7]).clamp(true);
  return toHex(s(tfr));
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
  return [1, 1.8, 2.5, 3.3, 4.5, 6, 7].map((value) => ({ value, color: rawColor(value, false) }));
}
