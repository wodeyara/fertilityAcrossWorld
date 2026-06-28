import { render, screen, fireEvent, within } from "@testing-library/react";
import { TableView } from "./TableView";
import type { Bundle } from "../types";
import type { FitResult } from "../lib/regression";

const bundle: Bundle = {
  snapshotYear: 2023,
  target: { id: "tfr", label: "TFR", transform: "log", unit: "births", source: "WB" },
  factors: [],
  coverage: {},
  countries: [
    { iso3: "USA", iso_num: 840, name: "United States", region: "NA", tfr: 1.6, tfr_year: 2022, factors: {} },
    { iso3: "NER", iso_num: 562, name: "Niger", region: "SSA", tfr: 6.8, tfr_year: 2021, factors: {} },
  ],
};
const fit: FitResult = {
  factorIds: [], transform: "log", n: 2, r2: 0.5, intercept: 0, coefficients: {},
  fits: new Map([
    ["USA", { predictedTfr: 1.4, residualTfr: 0.2, contributions: {} }],
    ["NER", { predictedTfr: 6.5, residualTfr: 0.3, contributions: {} }],
  ]),
};

test("renders a row per country and reports row clicks", () => {
  const onSelect = vi.fn();
  render(<TableView bundle={bundle} fit={fit} selectedIso3={null} onSelect={onSelect} />);
  expect(screen.getByText("United States")).toBeInTheDocument();
  expect(screen.getByText("Niger")).toBeInTheDocument();
  fireEvent.click(screen.getByText("Niger"));
  expect(onSelect).toHaveBeenCalledWith("NER");
});

test("clicking the residual header sorts the rows", () => {
  render(<TableView bundle={bundle} fit={fit} selectedIso3={null} onSelect={() => {}} />);
  let rows = screen.getAllByRole("row").slice(1); // skip header
  expect(within(rows[0]).getByText("Niger")).toBeInTheDocument(); // default: residual desc

  const header = screen.getByRole("button", { name: /residual/i });
  fireEvent.click(header); // -> asc: USA (0.2) first
  rows = screen.getAllByRole("row").slice(1);
  expect(within(rows[0]).getByText("United States")).toBeInTheDocument();

  fireEvent.click(header); // -> desc: Niger first
  rows = screen.getAllByRole("row").slice(1);
  expect(within(rows[0]).getByText("Niger")).toBeInTheDocument();
});
