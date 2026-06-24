import { loadBundle } from "./loadBundle";
import { test, expect, vi } from "vitest";

const FACTORS = {
  snapshotYear: 2023,
  target: { id: "tfr", label: "Total fertility rate", transform: "log", unit: "births per woman", source: "WB" },
  factors: [{ id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB" }],
};
const COUNTRIES = [
  { iso3: "USA", iso_num: 840, name: "United States", region: "North America", tfr: 1.66, tfr_year: 2022, factors: { gdp_pc: 63000 } },
  { iso3: "NER", iso_num: 562, name: "Niger", region: "Sub-Saharan Africa", tfr: 6.8, tfr_year: 2021, factors: { gdp_pc: null } },
];
const META = { snapshotYear: 2023, countryCount: 2, withTfr: 2, coverage: { gdp_pc: 1 } };

function mockFetch(map: Record<string, unknown>) {
  return (url: string) =>
    Promise.resolve({ ok: true, json: () => Promise.resolve(map[url.split("/").pop()!]) } as Response);
}

test("combines the three files into a Bundle", async () => {
  vi.stubGlobal("fetch", mockFetch({ "factors.json": FACTORS, "countries.json": COUNTRIES, "meta.json": META }));
  const bundle = await loadBundle("/data");
  expect(bundle.snapshotYear).toBe(2023);
  expect(bundle.target.transform).toBe("log");
  expect(bundle.factors).toHaveLength(1);
  expect(bundle.countries[0].iso_num).toBe(840);
  expect(bundle.coverage.gdp_pc).toBe(1);
});

test("throws if a country factor id is unknown to factors.json", async () => {
  const badCountries = [{ ...COUNTRIES[0], factors: { gdp_pc: 1, mystery: 2 } }];
  vi.stubGlobal("fetch", mockFetch({ "factors.json": FACTORS, "countries.json": badCountries, "meta.json": META }));
  await expect(loadBundle("/data")).rejects.toThrow(/unknown factor/i);
});
