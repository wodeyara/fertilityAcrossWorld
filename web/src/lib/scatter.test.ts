import { computeScatterPoints } from "./scatter";
import type { Country } from "../types";
import type { FitResult } from "./regression";

const countries: Country[] = [
  { iso3: "USA", iso_num: 840, name: "United States", region: "NA", tfr: 1.6, tfr_year: 2022, factors: { possibility: 0.3 } },
  { iso3: "NER", iso_num: 562, name: "Niger", region: "SSA", tfr: 6.8, tfr_year: 2021, factors: { possibility: -0.8 } },
  { iso3: "XXX", iso_num: 1, name: "NoFactor", region: "NA", tfr: 2.0, tfr_year: 2022, factors: { possibility: null } },
];
const fit: FitResult = {
  factorIds: ["gdp_pc"], transform: "log", n: 2, r2: 0.5, intercept: 0, coefficients: { gdp_pc: -1 },
  fits: new Map([["USA", { predictedTfr: 1.4, residualTfr: 0.2, contributions: {} }]]),
};

test("residual mode: x=factor, y=residual; skips missing", () => {
  const pts = computeScatterPoints(countries, fit, "residual", "possibility");
  expect(pts).toHaveLength(1); // only USA has both a possibility value and a fit residual
  expect(pts[0]).toMatchObject({ iso3: "USA", x: 0.3, y: 0.2 });
});

test("raw mode: y=tfr; skips null factor", () => {
  const pts = computeScatterPoints(countries, fit, "raw", "possibility");
  expect(pts.map((p) => p.iso3).sort()).toEqual(["NER", "USA"]); // XXX has null possibility
  expect(pts.find((p) => p.iso3 === "NER")!.y).toBe(6.8);
});
