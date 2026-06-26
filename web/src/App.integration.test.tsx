import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

const FACTORS = {
  snapshotYear: 2023,
  target: { id: "tfr", label: "Total fertility rate", transform: "log", unit: "births", source: "WB" },
  factors: [{ id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB" }],
};
const COUNTRIES = Array.from({ length: 10 }, (_, i) => ({
  iso3: `C${i}`, iso_num: 900 + i, name: `Country ${i}`, region: "R",
  tfr: Math.exp(0.6 + 0.4 * i), tfr_year: 2022, factors: { gdp_pc: i },
}));
const META = { snapshotYear: 2023, countryCount: 10, withTfr: 10, coverage: { gdp_pc: 10 } };
const TOPO = { type: "Topology", arcs: [[[0, 0], [0, 1], [1, 1], [0, 0]]], objects: { countries: { type: "GeometryCollection", geometries: [] } } };

function mockFetch(map: Record<string, unknown>) {
  return (url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve(map[url.split("/").pop()!]) } as Response);
}

test("loads bundle, fits a model, and shows an R² readout", async () => {
  vi.stubGlobal("fetch", mockFetch({
    "factors.json": FACTORS, "countries.json": COUNTRIES, "meta.json": META, "countries-110m.json": TOPO,
  }));
  render(<App />);
  await waitFor(() => expect(screen.getByTestId("r2-readout")).toBeInTheDocument());
  // gdp_pc selected by default -> a model is fit -> R² is a percentage, not em dash
  expect(screen.getByTestId("r2-readout").textContent).toMatch(/%/);
});

test("toggling the only factor off drops the model to insufficient", async () => {
  vi.stubGlobal("fetch", mockFetch({
    "factors.json": FACTORS, "countries.json": COUNTRIES, "meta.json": META, "countries-110m.json": TOPO,
  }));
  render(<App />);
  await waitFor(() => expect(screen.getByLabelText("GDP per capita")).toBeInTheDocument());
  fireEvent.click(screen.getByLabelText("GDP per capita")); // deselect
  await waitFor(() => expect(screen.getByTestId("r2-readout")).toHaveTextContent("—"));
});
