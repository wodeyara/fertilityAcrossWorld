import { feature } from "topojson-client";
import type { Country } from "../types";

export interface GeoFeature {
  id: string;
  properties: { name?: string };
  // geometry passed through to d3.geoPath
  [k: string]: unknown;
}

export function featuresFromTopo(topo: any, objectName = "countries", excludeName?: string): GeoFeature[] {
  const fc = feature(topo, topo.objects[objectName]) as unknown as { features: GeoFeature[] };
  return excludeName ? fc.features.filter((f) => f.properties?.name !== excludeName) : fc.features;
}

export function indexByIsoNum(countries: Country[]): Map<number, Country> {
  const m = new Map<number, Country>();
  for (const c of countries) m.set(c.iso_num, c);
  return m;
}
