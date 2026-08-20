import { fitModel } from "./regression";
import type { Country } from "../types";

function units(rows: { iso3: string; tfr: number; x: number }[]): Country[] {
  return rows.map((r) => ({
    iso3: r.iso3, iso_num: 0, name: r.iso3, region: "R",
    tfr: r.tfr, tfr_year: 2022, factors: { x: r.x },
  }));
}

test("raw single factor still fits a line (backward compatible)", () => {
  const cs = units(Array.from({ length: 20 }, (_, i) => ({ iso3: `C${i}`, tfr: 1 + 0.1 * i, x: i })));
  const fit = fitModel(cs, [{ id: "x" }], "raw");
  expect(fit.n).toBe(20);
  expect(fit.r2).not.toBeNull();
  expect(fit.r2 as number).toBeGreaterThan(0.99); // exact line
});

test("zero selected factors => insufficient (null R2, no fits)", () => {
  const cs = units(Array.from({ length: 20 }, (_, i) => ({ iso3: `C${i}`, tfr: 1 + 0.1 * i, x: i })));
  const fit = fitModel(cs, [], "raw");
  expect(fit.r2).toBeNull();
  expect(fit.fits.size).toBe(0);
});

test("log transform fits a log-linear factor far better than raw", () => {
  // tfr = 3 - 0.5*ln(x)
  const rows = Array.from({ length: 40 }, (_, i) => {
    const x = Math.exp(i / 6);
    return { iso3: `C${i}`, tfr: 3 - 0.5 * Math.log(x), x };
  });
  const raw = fitModel(units(rows), [{ id: "x", transform: "raw" }], "raw");
  const log = fitModel(units(rows), [{ id: "x", transform: "log" }], "raw");
  expect(log.r2 as number).toBeGreaterThan(raw.r2 as number);
  expect(log.r2 as number).toBeGreaterThan(0.999); // exact after log
});

test("quadratic captures a parabola a linear term cannot", () => {
  // tfr = 2 + 0.01*x^2, x symmetric about 0 -> linear term ~0, needs x^2
  const rows = Array.from({ length: 40 }, (_, i) => {
    const x = i - 20;
    return { iso3: `C${i}`, tfr: 2 + 0.01 * x * x, x };
  });
  const lin = fitModel(units(rows), [{ id: "x" }], "raw");
  const quad = fitModel(units(rows), [{ id: "x", quadratic: true }], "raw");
  expect(lin.r2 as number).toBeLessThan(0.2);
  expect(quad.r2 as number).toBeGreaterThan(0.99);
});

test("contribution is the combined linear + quadratic term per factor", () => {
  const rows = Array.from({ length: 40 }, (_, i) => {
    const x = i - 20;
    return { iso3: `C${i}`, tfr: 2 + 0.01 * x * x, x };
  });
  const fit = fitModel(units(rows), [{ id: "x", quadratic: true }], "raw");
  const f = fit.fits.get("C0")!;
  // exactly one contribution entry for the factor (linear+quad combined)
  expect(Object.keys(f.contributions)).toEqual(["x"]);
  // predicted matches the true tfr at x=-20 (2 + 0.01*400 = 6)
  expect(f.predictedTfr).toBeCloseTo(2 + 0.01 * 400, 4);
});

test("recovers a two-factor model with mixed linear + quadratic terms", () => {
  // tfr = 1 + 0.05*a - 0.01*b^2 (all positive); needs the right column->coef mapping
  const rows: Country[] = [];
  let k = 0;
  for (let a = 0; a < 8; a++)
    for (let b = -8; b < 8; b++)
      rows.push({
        iso3: `C${k++}`, iso_num: 0, name: "x", region: "R",
        tfr: 1 + 0.05 * a - 0.01 * b * b, tfr_year: 2022, factors: { a, b },
      });
  const fit = fitModel(rows, [{ id: "a" }, { id: "b", quadratic: true }], "raw");
  expect(fit.r2 as number).toBeGreaterThan(0.999); // exact model => R²≈1 only if columns map to the right coefs
  const f = fit.fits.get("C0")!;
  expect(Object.keys(f.contributions).sort()).toEqual(["a", "b"]);
});

test("log factor excludes non-positive rows from the fit", () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => ({ iso3: `P${i}`, tfr: 2 - 0.1 * Math.log(i + 1), x: i + 1 })),
    { iso3: "ZERO", tfr: 2, x: 0 }, // dropped by the log guard
  ];
  const fit = fitModel(units(rows), [{ id: "x", transform: "log" }], "raw");
  expect(fit.n).toBe(20);
  expect(fit.fits.has("ZERO")).toBe(false);
});
