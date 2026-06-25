import { indexByIsoNum } from "./geo";
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
