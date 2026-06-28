import { buildTableRows, sortRows } from "./table";
import type { Country } from "../types";
import type { FitResult } from "./regression";

const countries: Country[] = [
  { iso3: "USA", iso_num: 840, name: "United States", region: "NA", tfr: 1.6, tfr_year: 2022, factors: {} },
  { iso3: "NER", iso_num: 562, name: "Niger", region: "SSA", tfr: 6.8, tfr_year: 2021, factors: {} },
  { iso3: "XXX", iso_num: 1, name: "NoFit", region: "NA", tfr: 2.0, tfr_year: 2022, factors: {} },
];
const fit: FitResult = {
  factorIds: [], transform: "log", n: 2, r2: 0.5, intercept: 0, coefficients: {},
  fits: new Map([
    ["USA", { predictedTfr: 1.4, residualTfr: 0.2, contributions: {} }],
    ["NER", { predictedTfr: 6.5, residualTfr: 0.3, contributions: {} }],
  ]),
};

test("buildTableRows pulls predicted/residual, null when no fit", () => {
  const rows = buildTableRows(countries, fit);
  const xxx = rows.find((r) => r.iso3 === "XXX")!;
  expect(xxx.predicted).toBeNull();
  expect(rows.find((r) => r.iso3 === "USA")!.residual).toBe(0.2);
});

test("sortRows sorts by key with nulls last", () => {
  const rows = buildTableRows(countries, fit);
  const asc = sortRows(rows, "residual", "asc");
  expect(asc[0].iso3).toBe("USA"); // 0.2 < 0.3
  expect(asc[asc.length - 1].iso3).toBe("XXX"); // null last
  const desc = sortRows(rows, "residual", "desc");
  expect(desc[0].iso3).toBe("NER"); // 0.3 first
  expect(desc[desc.length - 1].iso3).toBe("XXX"); // null still last
});
