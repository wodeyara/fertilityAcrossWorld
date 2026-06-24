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

export interface Country {
  iso3: string;
  iso_num: number;
  name: string;
  region: string;
  tfr: number | null;
  tfr_year: number | null;
  factors: Record<string, number | null>;
}

export interface Bundle {
  snapshotYear: number;
  target: TargetMeta;
  factors: FactorMeta[];
  countries: Country[];
  coverage: Record<string, number>;
}
