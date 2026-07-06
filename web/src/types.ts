export type Direction = "positive" | "negative" | "mixed";

export interface FactorMeta {
  id: string;
  label: string;
  group: string;
  unit: string;
  direction: Direction;
  source: string;
}

export interface TargetMeta {
  id: string;
  label: string;
  transform: "raw" | "log";
  unit: string;
  source: string;
}

/**
 * A geographic unit at any scale.
 * `iso3`   — unit id: ISO alpha-3 for countries, USPS code (e.g. "CA") for US states.
 * `iso_num`— numeric join id matching the topojson feature id: ISO numeric / state FIPS.
 */
export interface GeoUnit {
  iso3: string;
  iso_num: number;
  name: string;
  region: string;
  tfr: number | null;
  tfr_year: number | null;
  factors: Record<string, number | null>;
}

/** @deprecated use GeoUnit — kept so existing imports keep compiling. */
export type Country = GeoUnit;

export interface Bundle {
  snapshotYear: number;
  target: TargetMeta;
  factors: FactorMeta[];
  countries: Country[];
  coverage: Record<string, number>;
}
