import { afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import App from "./App";

afterEach(() => { vi.unstubAllGlobals(); });

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

test("tab bar switches to the table and about views", async () => {
  vi.stubGlobal("fetch", mockFetch({
    "factors.json": FACTORS, "countries.json": COUNTRIES, "meta.json": META, "countries-110m.json": TOPO,
  }));
  render(<App />);
  await waitFor(() => expect(screen.getByTestId("r2-readout")).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /^table$/i }));
  expect(screen.getByRole("table")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^about$/i }));
  expect(screen.getByRole("heading", { name: /methodology/i })).toBeInTheDocument();
});

const US_FACTORS = {
  snapshotYear: 2023,
  target: { id: "tfr", label: "Total fertility rate", transform: "log", unit: "births", source: "CDC" },
  factors: [{ id: "social_capital", label: "Social Capital", group: "Social", unit: "index", direction: "positive", source: "OECD" }],
};
const US_COUNTRIES = [
  { iso3: "CA", iso_num: 6, name: "California", region: "West", tfr: 1.5, tfr_year: 2022, factors: { social_capital: 40 } },
  { iso3: "UT", iso_num: 49, name: "Utah", region: "West", tfr: 2.0, tfr_year: 2022, factors: { social_capital: 72 } },
];
const US_META = { snapshotYear: 2023, countryCount: 2, withTfr: 2, coverage: { social_capital: 2 } };
const US_TOPO = {
  type: "Topology",
  arcs: [],
  objects: { states: { type: "GeometryCollection", geometries: [] } },
};

it("switches to the US scale and renders state units", async () => {
  vi.stubGlobal("fetch", (url: string) => {
    let data: unknown;
    if (url.includes("/us/")) {
      const filename = url.split("/").pop()!;
      if (filename === "factors.json") data = US_FACTORS;
      else if (filename === "countries.json") data = US_COUNTRIES;
      else if (filename === "meta.json") data = US_META;
    } else if (url.includes("us-states-10m.json")) {
      data = US_TOPO;
    } else {
      const filename = url.split("/").pop()!;
      const worldMap: Record<string, unknown> = {
        "factors.json": FACTORS,
        "countries.json": COUNTRIES,
        "meta.json": META,
        "countries-110m.json": TOPO,
      };
      data = worldMap[filename];
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
  });

  render(<App />);
  await screen.findByText(/where fertility defies/i);
  // switch scale
  fireEvent.click(screen.getByRole("button", { name: /united states/i }));
  // a US-only factor label appears in the control panel
  expect(await screen.findByText(/social capital/i)).toBeInTheDocument();
  // a state name appears (table view or detail); use the table tab
  fireEvent.click(screen.getByRole("button", { name: /^table$/i }));
  expect(await screen.findByText(/california/i)).toBeInTheDocument();
});

test("world scale shows a working pronatalist-policy toggle; US scale does not", async () => {
  const POLICIES = [
    { iso_num: 900, iso3: "C0", stance: "raise",
      measures: { baby_bonus: true, parental_leave: null, childcare_subsidy: null, tax_incentive: null }, notes: null },
  ];
  vi.stubGlobal("fetch", (url: string) => {
    const body = url.includes("/us/")
      ? (url.endsWith("factors.json") ? { ...FACTORS, factors: [{ id: "income_pc", label: "Per-capita income", group: "Economic", unit: "$", direction: "negative", source: "ACS" }] }
        : url.endsWith("countries.json") ? [{ iso3: "CA", iso_num: 6, name: "California", region: "West", tfr: 1.7, tfr_year: 2022, factors: { income_pc: 5 } }]
        : { snapshotYear: 2022, countryCount: 1, withTfr: 1, coverage: { income_pc: 1 } })
      : url.includes("us-states-10m.json") ? { type: "Topology", arcs: [], objects: { states: { type: "GeometryCollection", geometries: [] } } }
      : url.endsWith("factors.json") ? FACTORS
      : url.endsWith("countries.json") ? COUNTRIES
      : url.endsWith("policies.json") ? POLICIES
      : url.endsWith("meta.json") ? META
      : TOPO;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
  });
  render(<App />);
  await waitFor(() => expect(screen.getByTestId("r2-readout")).toBeInTheDocument());
  // world scale: toggle present
  expect(screen.getByLabelText(/pronatalist policy/i)).toBeInTheDocument();
  // switch to US scale: toggle gone
  fireEvent.click(screen.getByRole("button", { name: /united states/i }));
  await waitFor(() => expect(screen.queryByLabelText(/pronatalist policy/i)).not.toBeInTheDocument());
});
