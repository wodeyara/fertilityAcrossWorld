import { render } from "@testing-library/react";
import { MapView } from "./MapView";
import type { Country } from "../types";
import type { FitResult } from "../lib/regression";

// Minimal fake topo with two square "countries" keyed by numeric id.
const topo = {
  type: "Topology",
  arcs: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
  objects: {
    countries: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", id: "840", arcs: [[0]], properties: { name: "United States of America" } },
        { type: "Polygon", id: "562", arcs: [[0]], properties: { name: "Niger" } },
      ],
    },
  },
};

const countries = [
  { iso3: "USA", iso_num: 840, name: "US", region: "R", tfr: 1.6, tfr_year: 2022, factors: {} },
  { iso3: "NER", iso_num: 562, name: "Niger", region: "R", tfr: 6.8, tfr_year: 2021, factors: {} },
] as Country[];
const byIsoNum = new Map(countries.map((c) => [c.iso_num, c]));
const fit: FitResult = {
  factorIds: ["x"], transform: "log", n: 2, r2: 0.9, intercept: 0, coefficients: { x: 1 },
  fits: new Map([["USA", { predictedTfr: 1.4, residualTfr: 0.2, contributions: { x: 0.1 } }]]),
};

test("renders one path per non-Antarctica country", () => {
  const { container } = render(
    <MapView topo={topo} byIsoNum={byIsoNum} fit={fit} mode="residual" selectedIso3={null} onSelect={() => {}} dark={false} />,
  );
  expect(container.querySelectorAll("path").length).toBe(2);
});
