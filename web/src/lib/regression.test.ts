import { fitModel } from "./regression";
import type { Country } from "../types";

function country(iso3: string, iso_num: number, tfr: number | null, x: number | null): Country {
  return { iso3, iso_num, name: iso3, region: "R", tfr, tfr_year: 2022, factors: { x } };
}

test("recovers a clean log-linear relationship (r2 ~ 1, residual ~ 0)", () => {
  // tfr = exp(0.6 + 0.4 * x), x = 0..19
  const countries: Country[] = [];
  for (let i = 0; i < 20; i++) {
    const x = i;
    countries.push(country(`C${i}`, i, Math.exp(0.6 + 0.4 * x), x));
  }
  const fit = fitModel(countries, ["x"], "log");
  expect(fit.n).toBe(20);
  expect(fit.r2).toBeGreaterThan(0.999);
  // residuals in TFR units are tiny relative to the values
  for (const [, f] of fit.fits) expect(Math.abs(f.residualTfr)).toBeLessThan(0.01 * f.predictedTfr + 0.01);
});

test("excludes countries missing the selected factor or tfr (no imputation)", () => {
  const countries = [
    country("A", 1, 2.0, 1),
    country("B", 2, null, 1), // no tfr
    country("C", 3, 3.0, null), // no factor
    country("D", 4, 4.0, 2),
    country("E", 5, 2.5, 1.5),
  ];
  const fit = fitModel(countries, ["x"], "raw");
  expect(fit.n).toBe(3); // A, D, E
  expect(fit.fits.has("B")).toBe(false);
  expect(fit.fits.has("C")).toBe(false);
  expect(fit.fits.has("A")).toBe(true);
  expect(fit.fits.has("D")).toBe(true);
  expect(fit.fits.has("E")).toBe(true);
});

test("excludes countries with tfr <= 0 (log-safe)", () => {
  const countries = [
    country("A", 1, 2.0, 1),
    country("B", 2, 0, 2),    // tfr 0 -> dropped (log(0) would be -Infinity)
    country("C", 3, 3.0, 3),
    country("D", 4, 2.5, 1.5),
  ];
  const fit = fitModel(countries, ["x"], "log");
  expect(fit.fits.has("B")).toBe(false);
  expect(fit.n).toBe(3);
});

test("returns r2=null when there are too few complete cases", () => {
  const fit = fitModel([country("A", 1, 2.0, 1)], ["x"], "raw");
  expect(fit.r2).toBeNull();
  expect(fit.fits.size).toBe(0);
});

test("returns r2=null when no factors are selected", () => {
  const fit = fitModel([country("A", 1, 2.0, 1), country("B", 2, 3.0, 2)], [], "raw");
  expect(fit.r2).toBeNull();
  expect(fit.fits.size).toBe(0);
});
