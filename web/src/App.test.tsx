import { render, screen, waitFor } from "@testing-library/react";
import App from "./App";

test("renders the app title", async () => {
  // Mock fetch for the bundle and topo
  const mockFetch = (url: string) =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve(
          url.includes("factors.json")
            ? { snapshotYear: 2023, target: { id: "tfr", label: "Total fertility rate", transform: "log", unit: "births", source: "WB" }, factors: [] }
            : url.includes("countries.json")
              ? []
              : url.includes("meta.json")
                ? { snapshotYear: 2023, countryCount: 0, withTfr: 0, coverage: {} }
                : { type: "Topology", arcs: [], objects: { countries: { type: "GeometryCollection", geometries: [] } } },
        ),
    } as Response);

  vi.stubGlobal("fetch", mockFetch);
  render(<App />);
  // Wait for the app to load and render the h1
  await waitFor(() => expect(screen.getByText(/where fertility defies the numbers/i)).toBeInTheDocument());
});
