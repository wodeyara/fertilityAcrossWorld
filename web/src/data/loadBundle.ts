import type { Bundle, Country, FactorMeta, TargetMeta } from "../types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  return (await res.json()) as T;
}

export async function loadBundle(baseUrl = "/data"): Promise<Bundle> {
  const [factorsDoc, countries, meta] = await Promise.all([
    getJson<{ snapshotYear: number; target: TargetMeta; factors: FactorMeta[] }>(`${baseUrl}/factors.json`),
    getJson<Country[]>(`${baseUrl}/countries.json`),
    getJson<{ snapshotYear: number; countryCount: number; withTfr: number; coverage: Record<string, number> }>(
      `${baseUrl}/meta.json`,
    ),
  ]);

  const known = new Set(factorsDoc.factors.map((f) => f.id));
  for (const c of countries) {
    for (const id of Object.keys(c.factors)) {
      if (!known.has(id)) throw new Error(`unknown factor id in countries.json: ${id}`);
    }
  }

  return {
    snapshotYear: factorsDoc.snapshotYear,
    target: factorsDoc.target,
    factors: factorsDoc.factors,
    countries,
    coverage: meta.coverage,
  };
}
