import type { Country } from "../types";
import type { FitResult } from "./regression";

export interface TableRow {
  iso3: string;
  name: string;
  region: string;
  tfr: number | null;
  predicted: number | null;
  residual: number | null;
}

export function buildTableRows(countries: Country[], fit: FitResult): TableRow[] {
  return countries.map((c) => {
    const f = fit.fits.get(c.iso3);
    return {
      iso3: c.iso3,
      name: c.name,
      region: c.region,
      tfr: c.tfr,
      predicted: f ? f.predictedTfr : null,
      residual: f ? f.residualTfr : null,
    };
  });
}

export function sortRows(rows: TableRow[], key: keyof TableRow, dir: "asc" | "desc"): TableRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[key];
    const bv = b[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1; // nulls last regardless of dir
    if (bv == null) return -1;
    if (av < bv) return -1 * sign;
    if (av > bv) return 1 * sign;
    return 0;
  });
}
