import { Matrix, solve } from "ml-matrix";
import type { Country } from "../types";

export interface CountryFit {
  predictedTfr: number;
  residualTfr: number;
  contributions: Record<string, number>;
}

export interface FitResult {
  factorIds: string[];
  transform: "raw" | "log";
  n: number;
  r2: number | null;
  intercept: number;
  coefficients: Record<string, number>;
  fits: Map<string, CountryFit>;
}

function empty(factorIds: string[], transform: "raw" | "log", n: number): FitResult {
  return { factorIds, transform, n, r2: null, intercept: NaN, coefficients: {}, fits: new Map() };
}

export function fitModel(
  countries: Country[],
  factorIds: string[],
  transform: "raw" | "log",
): FitResult {
  const complete = countries.filter(
    (c) =>
      c.tfr != null &&
      c.tfr > 0 &&
      factorIds.every((f) => c.factors[f] != null),
  );
  const n = complete.length;
  // Zero selected factors => nothing to "control for" => insufficient (prompt the user).
  if (factorIds.length === 0 || n < factorIds.length + 2) return empty(factorIds, transform, n);

  // standardize each factor over complete cases
  const means: Record<string, number> = {};
  const stds: Record<string, number> = {};
  for (const f of factorIds) {
    const vals = complete.map((c) => c.factors[f] as number);
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    means[f] = mean;
    stds[f] = variance === 0 ? 1 : Math.sqrt(variance);
  }

  const z = (c: Country, f: string) => ((c.factors[f] as number) - means[f]) / stds[f];

  const y = complete.map((c) => (transform === "log" ? Math.log(c.tfr as number) : (c.tfr as number)));
  const X = complete.map((c) => [1, ...factorIds.map((f) => z(c, f))]);

  const beta = solve(new Matrix(X), Matrix.columnVector(y), true).to1DArray();
  const intercept = beta[0];
  const coefficients: Record<string, number> = {};
  factorIds.forEach((f, j) => (coefficients[f] = beta[j + 1]));

  // R^2 in transform space
  const fittedT = X.map((row) => row.reduce((s, v, j) => s + v * beta[j], 0));
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const ssRes = y.reduce((s, yi, i) => s + (yi - fittedT[i]) ** 2, 0);
  const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const r2 = ssTot === 0 ? null : 1 - ssRes / ssTot;

  const fits = new Map<string, CountryFit>();
  complete.forEach((c, i) => {
    const predictedTfr = transform === "log" ? Math.exp(fittedT[i]) : fittedT[i];
    const contributions: Record<string, number> = {};
    for (const f of factorIds) contributions[f] = coefficients[f] * z(c, f);
    fits.set(c.iso3, {
      predictedTfr,
      residualTfr: (c.tfr as number) - predictedTfr,
      contributions,
    });
  });

  return { factorIds, transform, n, r2, intercept, coefficients, fits };
}
