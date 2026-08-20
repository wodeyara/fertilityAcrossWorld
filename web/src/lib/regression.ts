import { Matrix, solve } from "ml-matrix";
import type { Country } from "../types";

export interface FactorSpec {
  id: string;
  transform?: "raw" | "log";
  quadratic?: boolean;
}

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

const isLog = (f: FactorSpec) => f.transform === "log";

export function fitModel(
  countries: Country[],
  factors: FactorSpec[],
  transform: "raw" | "log",
): FitResult {
  const factorIds = factors.map((f) => f.id);
  const complete = countries.filter(
    (c) =>
      c.tfr != null &&
      c.tfr > 0 &&
      factors.every((f) => c.factors[f.id] != null && (!isLog(f) || (c.factors[f.id] as number) > 0)),
  );
  const n = complete.length;
  const quadFactors = factors.filter((f) => f.quadratic);
  const nCols = factors.length + quadFactors.length;
  // Zero selected factors => nothing to "control for"; also need enough rows for the columns.
  if (factors.length === 0 || n < nCols + 2) return empty(factorIds, transform, n);

  const tval = (c: Country, f: FactorSpec) =>
    isLog(f) ? Math.log(c.factors[f.id] as number) : (c.factors[f.id] as number);

  // standardize each linear (transformed) term over complete cases
  const means: Record<string, number> = {};
  const stds: Record<string, number> = {};
  for (const f of factors) {
    const vals = complete.map((c) => tval(c, f));
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    means[f.id] = mean;
    stds[f.id] = variance === 0 ? 1 : Math.sqrt(variance);
  }
  const z = (c: Country, f: FactorSpec) => (tval(c, f) - means[f.id]) / stds[f.id];

  // standardize the squared term (z^2) for each curved factor
  const qmeans: Record<string, number> = {};
  const qstds: Record<string, number> = {};
  for (const f of quadFactors) {
    const qs = complete.map((c) => z(c, f) ** 2);
    const mean = qs.reduce((a, b) => a + b, 0) / n;
    const variance = qs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    qmeans[f.id] = mean;
    qstds[f.id] = variance === 0 ? 1 : Math.sqrt(variance);
  }
  const zq = (c: Country, f: FactorSpec) => (z(c, f) ** 2 - qmeans[f.id]) / qstds[f.id];

  const y = complete.map((c) => (transform === "log" ? Math.log(c.tfr as number) : (c.tfr as number)));
  // columns: [1, linear terms in factor order, quadratic terms in factor order]
  const X = complete.map((c) => [1, ...factors.map((f) => z(c, f)), ...quadFactors.map((f) => zq(c, f))]);

  const beta = solve(new Matrix(X), Matrix.columnVector(y), true).to1DArray();
  const intercept = beta[0];
  const linCoef: Record<string, number> = {};
  factors.forEach((f, j) => (linCoef[f.id] = beta[1 + j]));
  const quadCoef: Record<string, number> = {};
  quadFactors.forEach((f, j) => (quadCoef[f.id] = beta[1 + factors.length + j]));

  const fittedT = X.map((row) => row.reduce((s, v, j) => s + v * beta[j], 0));
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const ssRes = y.reduce((s, yi, i) => s + (yi - fittedT[i]) ** 2, 0);
  const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const r2 = ssTot === 0 ? null : 1 - ssRes / ssTot;

  const fits = new Map<string, CountryFit>();
  complete.forEach((c, i) => {
    const predictedTfr = transform === "log" ? Math.exp(fittedT[i]) : fittedT[i];
    const contributions: Record<string, number> = {};
    for (const f of factors) {
      let contrib = linCoef[f.id] * z(c, f);
      if (f.quadratic) contrib += quadCoef[f.id] * zq(c, f);
      contributions[f.id] = contrib;
    }
    fits.set(c.iso3, {
      predictedTfr,
      residualTfr: (c.tfr as number) - predictedTfr,
      contributions,
    });
  });

  return { factorIds, transform, n, r2, intercept, coefficients: linCoef, fits };
}
