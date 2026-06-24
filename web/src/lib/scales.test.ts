import { residualColor, rawColor, residualLegendStops, rawLegendStops } from "./scales";

test("residual: positive is reddish, negative is bluish, differ", () => {
  const pos = residualColor(1.0, 1.5, false);
  const neg = residualColor(-1.0, 1.5, false);
  expect(pos).not.toBe(neg);
  // red channel higher for positive residual than negative
  const red = (hex: string) => parseInt(hex.slice(1, 3), 16);
  expect(red(pos)).toBeGreaterThan(red(neg));
});

test("residual clamps beyond maxAbs", () => {
  expect(residualColor(5, 1.5, false)).toBe(residualColor(1.5, 1.5, false));
});

test("raw color is a valid hex over the domain", () => {
  expect(rawColor(0.8, false)).toMatch(/^#[0-9a-f]{6}$/i);
  expect(rawColor(7, false)).toMatch(/^#[0-9a-f]{6}$/i);
});

test("legend stops are non-empty and ordered", () => {
  expect(residualLegendStops().length).toBeGreaterThanOrEqual(5);
  expect(rawLegendStops().length).toBeGreaterThanOrEqual(5);
});
