import { render, screen } from "@testing-library/react";
import { DetailPanel } from "./DetailPanel";
import type { Country, FactorMeta } from "../types";
import type { FitResult } from "../lib/regression";

const factors: FactorMeta[] = [
  { id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB" },
];
const israel: Country = {
  iso3: "ISR", iso_num: 376, name: "Israel", region: "MENA", tfr: 2.9, tfr_year: 2022, factors: { gdp_pc: 47000 },
};
const fit: FitResult = {
  factorIds: ["gdp_pc"], transform: "log", n: 100, r2: 0.7, intercept: 0, coefficients: { gdp_pc: -0.5 },
  fits: new Map([["ISR", { predictedTfr: 1.7, residualTfr: 1.2, contributions: { gdp_pc: -0.4 } }]]),
};

test("shows actual vs predicted and the residual", () => {
  render(<DetailPanel country={israel} fit={fit} factors={factors} />);
  expect(screen.getByText("Israel")).toBeInTheDocument();
  expect(screen.getByText(/2\.9/)).toBeInTheDocument(); // actual
  expect(screen.getByText(/1\.7/)).toBeInTheDocument(); // predicted
  expect(screen.getByText(/higher than predicted/i)).toBeInTheDocument();
});

test("shows insufficient-data message when no fit", () => {
  const noFit: FitResult = { ...fit, fits: new Map() };
  render(<DetailPanel country={israel} fit={noFit} factors={factors} />);
  expect(screen.getByText(/insufficient data/i)).toBeInTheDocument();
});

test("prompts when nothing selected", () => {
  render(<DetailPanel country={null} fit={fit} factors={factors} />);
  expect(screen.getByText(/click a country/i)).toBeInTheDocument();
});
