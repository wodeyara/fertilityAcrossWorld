import { indexByIsoNum, featuresFromTopo } from "./geo";
import type { Country } from "../types";

test("indexes countries by numeric iso code", () => {
  const countries = [
    { iso3: "USA", iso_num: 840, name: "US", region: "R", tfr: 1.6, tfr_year: 2022, factors: {} },
    { iso3: "NER", iso_num: 562, name: "Niger", region: "R", tfr: 6.8, tfr_year: 2021, factors: {} },
  ] as Country[];
  const idx = indexByIsoNum(countries);
  expect(idx.get(840)?.iso3).toBe("USA");
  expect(idx.get(562)?.iso3).toBe("NER");
});

test("featuresFromTopo returns features and drops Antarctica", () => {
  const topo = {
    type: "Topology",
    arcs: [[[0, 0], [0, 1], [1, 1], [0, 0]]],
    objects: {
      countries: {
        type: "GeometryCollection",
        geometries: [
          { type: "Polygon", id: "840", arcs: [[0]], properties: { name: "United States of America" } },
          { type: "Polygon", id: "010", arcs: [[0]], properties: { name: "Antarctica" } },
        ],
      },
    },
  };
  const feats = featuresFromTopo(topo);
  expect(feats.length).toBe(1);
  expect(feats[0].properties.name).toBe("United States of America");
});
