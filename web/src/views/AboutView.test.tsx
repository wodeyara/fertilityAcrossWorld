import { render, screen } from "@testing-library/react";
import { AboutView } from "./AboutView";
import type { Bundle } from "../types";

const bundle: Bundle = {
  snapshotYear: 2023,
  target: { id: "tfr", label: "Total fertility rate", transform: "log", unit: "births", source: "World Bank" },
  factors: [
    { id: "possibility", label: "Possibility index", group: "Possibility", unit: "z", direction: "negative", source: "computed" },
    { id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "World Bank" },
  ],
  coverage: {},
  countries: [],
};

test("renders methodology sections and the transform", () => {
  render(<AboutView bundle={bundle} />);
  expect(screen.getByRole("heading", { name: /methodology/i })).toBeInTheDocument();
  expect(screen.getByText(/log total fertility rate/i)).toBeInTheDocument(); // transform surfaced
  expect(screen.getByRole("heading", { name: /limitations/i })).toBeInTheDocument();
  expect(screen.getByText("Possibility index")).toBeInTheDocument(); // factor listed
});

it("documents the US-states sub-national layer", () => {
  render(<AboutView bundle={bundle as any} />);
  expect(screen.getByText(/sub-national/i)).toBeInTheDocument();
  expect(screen.getByText(/present-day/i)).toBeInTheDocument();
  expect(screen.getByText(/separate model/i)).toBeInTheDocument();
});

test("explains the pronatalist-policy overlay and that it is not a covariate", () => {
  render(<AboutView bundle={bundle} />);
  expect(screen.getByRole("heading", { name: /pronatalist policy/i })).toBeInTheDocument();
  expect(screen.getByText(/not.*(covariate|predictor)/i)).toBeInTheDocument();
});

test("notes the connectivity factors and the collinearity caveat", () => {
  render(<AboutView bundle={bundle} />);
  expect(screen.getByRole("heading", { name: /connectivity/i })).toBeInTheDocument();
  expect(screen.getByText(/collinear/i)).toBeInTheDocument();
});
