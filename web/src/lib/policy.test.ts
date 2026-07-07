import { afterEach, test, expect, vi } from "vitest";
import { loadPolicies, indexPoliciesByIsoNum, type Policy } from "./policy";

afterEach(() => { vi.unstubAllGlobals(); });

const SAMPLE: Policy[] = [
  { iso_num: 250, iso3: "FRA", stance: "raise",
    measures: { baby_bonus: true, parental_leave: true, childcare_subsidy: true, tax_incentive: true }, notes: "x" },
];

test("loadPolicies fetches and returns the array", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE) } as Response));
  const ps = await loadPolicies("/data");
  expect(ps[0].stance).toBe("raise");
});

test("loadPolicies returns [] when the file is missing", async () => {
  vi.stubGlobal("fetch", () => Promise.resolve({ ok: false, status: 404 } as Response));
  expect(await loadPolicies("/data")).toEqual([]);
});

test("loadPolicies returns [] when fetch throws", async () => {
  vi.stubGlobal("fetch", () => Promise.reject(new Error("network")));
  expect(await loadPolicies("/data")).toEqual([]);
});

test("indexPoliciesByIsoNum keys by iso_num", () => {
  const m = indexPoliciesByIsoNum(SAMPLE);
  expect(m.get(250)?.iso3).toBe("FRA");
});
