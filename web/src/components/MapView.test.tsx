import { render, fireEvent } from "@testing-library/react";
import { MapView } from "./MapView";
import type { Country } from "../types";
import type { FitResult } from "../lib/regression";
import { INSUFFICIENT_COLOR } from "../lib/scales";

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

test("residual mode: a country with no fit renders the insufficient color", () => {
  const { container } = render(
    <MapView topo={topo} byIsoNum={byIsoNum} fit={fit} mode="residual" selectedIso3={null} onSelect={() => {}} dark={false} />,
  );
  const fills = [...container.querySelectorAll("path")].map((p) => p.getAttribute("fill"));
  expect(fills).toContain(INSUFFICIENT_COLOR(false)); // NER has no fit
  expect(fills.some((f) => f !== INSUFFICIENT_COLOR(false))).toBe(true); // USA has a fit
});

test("clicking a country calls onSelect with its iso3", () => {
  const onSelect = vi.fn();
  const { container } = render(
    <MapView topo={topo} byIsoNum={byIsoNum} fit={fit} mode="residual" selectedIso3={null} onSelect={onSelect} dark={false} />,
  );
  fireEvent.click(container.querySelectorAll("path")[0]); // first feature is USA (id 840)
  expect(onSelect).toHaveBeenCalledWith("USA");
});

test("renders a feature with an undefined id without key collision (insufficient color)", () => {
  const topoNoId = {
    type: "Topology",
    arcs: [[[0, 0], [0, 1], [1, 1], [0, 0]]],
    objects: {
      countries: {
        type: "GeometryCollection",
        geometries: [
          { type: "Polygon", id: "840", arcs: [[0]], properties: { name: "United States of America" } },
          { type: "Polygon", arcs: [[0]], properties: { name: "N. Cyprus" } },
        ],
      },
    },
  };
  const { container } = render(
    <MapView topo={topoNoId} byIsoNum={byIsoNum} fit={fit} mode="residual" selectedIso3={null} onSelect={() => {}} dark={false} />,
  );
  const paths = container.querySelectorAll("path");
  expect(paths.length).toBe(2);
  const fills = [...paths].map((p) => p.getAttribute("fill"));
  expect(fills).toContain(INSUFFICIENT_COLOR(false));
});
