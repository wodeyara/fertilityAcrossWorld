import { render, screen, fireEvent } from "@testing-library/react";
import { ScatterView } from "./ScatterView";
import type { Bundle } from "../types";
import type { FitResult } from "../lib/regression";

const bundle: Bundle = {
  snapshotYear: 2023,
  target: { id: "tfr", label: "Total fertility rate", transform: "log", unit: "births", source: "WB" },
  factors: [
    { id: "possibility", label: "Possibility index", group: "Possibility", unit: "z", direction: "negative", source: "computed" },
    { id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "worldbank" },
  ],
  coverage: {},
  countries: [
    { iso3: "USA", iso_num: 840, name: "United States", region: "NA", tfr: 1.6, tfr_year: 2022, factors: { possibility: 0.3, gdp_pc: 60000 } },
    { iso3: "NER", iso_num: 562, name: "Niger", region: "SSA", tfr: 6.8, tfr_year: 2021, factors: { possibility: -0.8, gdp_pc: 1200 } },
  ],
};
const fit: FitResult = {
  factorIds: ["gdp_pc"], transform: "log", n: 2, r2: 0.5, intercept: 0, coefficients: { gdp_pc: -1 },
  fits: new Map([
    ["USA", { predictedTfr: 1.4, residualTfr: 0.2, contributions: {} }],
    ["NER", { predictedTfr: 6.5, residualTfr: 0.3, contributions: {} }],
  ]),
};

test("renders one circle per plottable country and reports clicks", () => {
  const onSelect = vi.fn();
  const { container } = render(
    <ScatterView bundle={bundle} fit={fit} mode="residual" xFactorId="possibility"
      onSetXFactor={() => {}} selectedIso3={null} onSelect={onSelect} dark={false} />,
  );
  const circles = container.querySelectorAll("circle");
  expect(circles.length).toBe(2);
  fireEvent.click(circles[0]);
  expect(onSelect).toHaveBeenCalledWith("USA");
});

test("changing the X-axis factor select reports it", () => {
  const onSetXFactor = vi.fn();
  render(
    <ScatterView bundle={bundle} fit={fit} mode="residual" xFactorId="possibility"
      onSetXFactor={onSetXFactor} selectedIso3={null} onSelect={() => {}} dark={false} />,
  );
  fireEvent.change(screen.getByLabelText(/x-axis/i), { target: { value: "gdp_pc" } });
  expect(onSetXFactor).toHaveBeenCalledWith("gdp_pc");
});

test("shows a no-data message when no points are plottable", () => {
  const emptyFit = { ...fit, fits: new Map() };
  const { container } = render(
    <ScatterView bundle={bundle} fit={emptyFit} mode="residual" xFactorId="possibility"
      onSetXFactor={() => {}} selectedIso3={null} onSelect={() => {}} dark={false} />,
  );
  expect(container.querySelectorAll("circle").length).toBe(0);
  expect(screen.getByText(/no countries have data/i)).toBeInTheDocument();
});
