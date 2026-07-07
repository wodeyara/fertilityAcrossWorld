# Pronatalist-Policy Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable pronatalist-policy overlay to the world map — a diagonal hatch on countries whose government policy is to *raise* fertility, plus a per-country policy detail — sourced from UN/OECD data and kept strictly out of the regression.

**Architecture:** A new committed `policies.csv` → pipeline emits a standalone `policies.json` (keyed by `iso_num`, never merged into `factors.json`). The web app loads it for the world scale only, renders a hatch overlay on `raise` countries, and shows stance + measures in the detail panel. All changes default to today's behavior (overlay off, world-only).

**Tech Stack:** Python (pandas-free stdlib csv), pytest; React 18 + TypeScript + D3 (SVG `<pattern>`), Vitest + testing-library.

## Global Constraints

- Policy is an **overlay, not a covariate** — emitted separately from `factors.json`; it must NEVER appear in the regression `factorIds` or the factor list.
- **No silent imputation** — a missing stance/measure is `null`/`"—"`, never guessed. Unknown stance strings coerce to `null`.
- **World scale only** — the policy toggle is hidden and no policy data loads at the US-states scale.
- **Backward compatibility** — every generalized signature defaults to prior behavior; the existing country pipeline, US-states bundle, and all existing tests must be unaffected. The US bundle must NOT gain a `policies.json`.
- `stance` ∈ `{"raise","maintain","lower","none", null}`. Measures are `true | false | null`.
- Pipeline commands run from `data-pipeline/` via `.venv/bin/pytest`. Web commands run from `web/` via `npm run test` / `npm run build`.

---

### Task 1: Policy CSV loader (`policies.py`)

**Files:**
- Create: `data-pipeline/fertility_pipeline/policies.py`
- Create: `data-pipeline/tests/fixtures/policies_sample.csv`
- Test: `data-pipeline/tests/test_policies.py`

**Interfaces:**
- Produces: `load_policies(path) -> dict[str, dict]` keyed by ISO3. Each value:
  `{"stance": str|None, "measures": {"baby_bonus": bool|None, "parental_leave": bool|None, "childcare_subsidy": bool|None, "tax_incentive": bool|None}, "notes": str|None}`.
  Module constants: `STANCES = {"raise","maintain","lower","none"}`, `MEASURE_COLS = ["baby_bonus","parental_leave","childcare_subsidy","tax_incentive"]`.

- [ ] **Step 1: Write the fixture CSV**

Create `data-pipeline/tests/fixtures/policies_sample.csv`:

```csv
iso3,stance,baby_bonus,parental_leave,childcare_subsidy,tax_incentive,notes
FRA,raise,yes,yes,yes,yes,Strong family policy
KOR,raise,yes,yes,no,yes,
USA,none,no,no,no,no,
IND,lower,no,no,no,no,
XXX,banana,,,,,unknown stance -> null
NUL,,,,,,no data at all
```

- [ ] **Step 2: Write the failing test**

Create `data-pipeline/tests/test_policies.py`:

```python
from pathlib import Path
from fertility_pipeline import policies

FIX = Path(__file__).parent / "fixtures" / "policies_sample.csv"


def test_loads_stance_and_measures():
    out = policies.load_policies(FIX)
    fra = out["FRA"]
    assert fra["stance"] == "raise"
    assert fra["measures"] == {
        "baby_bonus": True, "parental_leave": True,
        "childcare_subsidy": True, "tax_incentive": True,
    }
    assert fra["notes"] == "Strong family policy"


def test_no_measure_and_no_stance_are_none():
    out = policies.load_policies(FIX)
    nul = out["NUL"]
    assert nul["stance"] is None
    assert all(v is None for v in nul["measures"].values())
    assert nul["notes"] is None


def test_unknown_stance_coerced_to_none():
    out = policies.load_policies(FIX)
    assert out["XXX"]["stance"] is None  # "banana" is not a valid stance


def test_no_partial_only_yes_or_no_or_none():
    out = policies.load_policies(FIX)
    kor = out["KOR"]
    assert kor["measures"]["childcare_subsidy"] is False
    assert kor["measures"]["baby_bonus"] is True
```

- [ ] **Step 3: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_policies.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'fertility_pipeline.policies'`

- [ ] **Step 4: Write the implementation**

Create `data-pipeline/fertility_pipeline/policies.py`:

```python
import csv

STANCES = {"raise", "maintain", "lower", "none"}
MEASURE_COLS = ["baby_bonus", "parental_leave", "childcare_subsidy", "tax_incentive"]


def _yes_no(v):
    v = (v or "").strip().lower()
    if v == "yes":
        return True
    if v == "no":
        return False
    return None


def load_policies(path) -> dict[str, dict]:
    out: dict[str, dict] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            iso3 = (row.get("iso3") or "").strip().upper()
            if len(iso3) != 3:
                continue
            stance = (row.get("stance") or "").strip().lower() or None
            if stance not in STANCES:
                stance = None
            out[iso3] = {
                "stance": stance,
                "measures": {c: _yes_no(row.get(c)) for c in MEASURE_COLS},
                "notes": (row.get("notes") or "").strip() or None,
            }
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv/bin/pytest tests/test_policies.py -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add data-pipeline/fertility_pipeline/policies.py data-pipeline/tests/test_policies.py data-pipeline/tests/fixtures/policies_sample.csv
git commit -m "feat(pipeline): policy CSV loader (stance + measures, no imputation)"
```

---

### Task 2: Emit `policies.json` + schema + wire into world pipeline

**Files:**
- Modify: `data-pipeline/fertility_pipeline/emit.py`
- Create: `data-pipeline/data/schema/policies.schema.json`
- Modify: `data-pipeline/fertility_pipeline/run.py`
- Test: `data-pipeline/tests/test_emit.py` (append)

**Interfaces:**
- Consumes: `load_policies` from Task 1; the country `records` list (each has `iso3`, `iso_num`).
- Produces: `write_bundle(records, transform_choice, snapshot_year, out_dir, registry=_default_registry, policies=None)`. When `policies` (a dict ISO3→record from `load_policies`) is passed, `write_bundle` ALSO writes `policies.json` (a list of `{iso_num, iso3, stance, measures, notes}` for every country record, policy fields defaulting to null/empty when the ISO3 is absent from `policies`) and adds `"policyCoverage"` (count of non-null stances) to `meta.json`. When `policies is None` (US path), nothing policy-related is emitted.

- [ ] **Step 1: Write the failing test**

Append to `data-pipeline/tests/test_emit.py`:

```python
def test_write_bundle_emits_policies_json(tmp_path):
    from fertility_pipeline import emit
    records = [
        {"iso3": "FRA", "iso_num": 250, "name": "France", "region": "Europe & Central Asia",
         "tfr": 1.8, "tfr_year": 2022, "factors": {"gdp_pc": 1.0}},
        {"iso3": "USA", "iso_num": 840, "name": "United States", "region": "North America",
         "tfr": 1.6, "tfr_year": 2022, "factors": {"gdp_pc": 2.0}},
    ]
    policies = {
        "FRA": {"stance": "raise",
                "measures": {"baby_bonus": True, "parental_leave": True,
                             "childcare_subsidy": True, "tax_incentive": True},
                "notes": "x"},
    }
    meta = emit.write_bundle(records, "raw", 2022, tmp_path, policies=policies)
    import json
    pol = json.loads((tmp_path / "policies.json").read_text())
    by_iso = {p["iso3"]: p for p in pol}
    assert by_iso["FRA"]["iso_num"] == 250
    assert by_iso["FRA"]["stance"] == "raise"
    assert by_iso["FRA"]["measures"]["baby_bonus"] is True
    # country with no policy record still present, all null
    assert by_iso["USA"]["stance"] is None
    assert by_iso["USA"]["measures"]["tax_incentive"] is None
    assert meta["policyCoverage"] == 1


def test_write_bundle_without_policies_emits_no_policies_json(tmp_path):
    from fertility_pipeline import emit
    records = [
        {"iso3": "USA", "iso_num": 840, "name": "United States", "region": "North America",
         "tfr": 1.6, "tfr_year": 2022, "factors": {"gdp_pc": 2.0}},
    ]
    meta = emit.write_bundle(records, "raw", 2022, tmp_path)
    assert not (tmp_path / "policies.json").exists()
    assert "policyCoverage" not in meta
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_emit.py -k policies -v`
Expected: FAIL — `write_bundle() got an unexpected keyword argument 'policies'`

- [ ] **Step 3: Create the policies schema**

Create `data-pipeline/data/schema/policies.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["iso_num", "iso3", "stance", "measures", "notes"],
    "properties": {
      "iso_num": {"type": "integer"},
      "iso3": {"type": "string", "minLength": 2, "maxLength": 3},
      "stance": {"type": ["string", "null"], "enum": ["raise", "maintain", "lower", "none", null]},
      "measures": {
        "type": "object",
        "additionalProperties": {"type": ["boolean", "null"]}
      },
      "notes": {"type": ["string", "null"]}
    }
  }
}
```

- [ ] **Step 4: Implement the emit changes**

In `data-pipeline/fertility_pipeline/emit.py`, add a helper and extend `write_bundle`. Add near the other builders:

```python
from .policies import MEASURE_COLS


def _build_policies_json(records: list[dict], policies: dict) -> list[dict]:
    empty_measures = {c: None for c in MEASURE_COLS}
    out = []
    for r in records:
        p = policies.get(r["iso3"])
        out.append({
            "iso_num": r["iso_num"],
            "iso3": r["iso3"],
            "stance": p["stance"] if p else None,
            "measures": dict(p["measures"]) if p else dict(empty_measures),
            "notes": p["notes"] if p else None,
        })
    return out
```

Change the `write_bundle` signature and body. The current signature is:

```python
def write_bundle(records, transform_choice, snapshot_year, out_dir, registry=_default_registry):
```

Replace it with:

```python
def write_bundle(records, transform_choice, snapshot_year, out_dir, registry=_default_registry, policies=None):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    factors_json = _build_factors_json(snapshot_year, transform_choice, registry)
    meta = _build_meta(records, snapshot_year, registry)

    _validate(records, "countries.schema.json")
    _validate(factors_json, "factors.schema.json")

    (out / "factors.json").write_text(json.dumps(factors_json, indent=2))
    (out / "countries.json").write_text(json.dumps(records, indent=2))

    if policies is not None:
        policies_json = _build_policies_json(records, policies)
        _validate(policies_json, "policies.schema.json")
        (out / "policies.json").write_text(json.dumps(policies_json, indent=2))
        meta["policyCoverage"] = sum(1 for p in policies_json if p["stance"] is not None)

    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta
```

(Keep the existing `_build_factors_json`/`_build_meta`/`_validate` signatures exactly as they already are — only the `write_bundle` body changes plus the new import and `_build_policies_json` helper.)

- [ ] **Step 5: Run test to verify it passes**

Run: `.venv/bin/pytest tests/test_emit.py -v`
Expected: PASS (existing emit tests + 2 new)

- [ ] **Step 6: Wire into the world pipeline**

In `data-pipeline/fertility_pipeline/run.py`, add a `policies_path` param to `run_pipeline` and load+pass it. Change the imports line to include `policies as policies_mod`:

```python
from . import policies as policies_mod
```

In `run_pipeline`, change the signature to add `policies_path="data/policies.csv"` (after `osm_fetch=None`), and before the final `return`:

```python
    records = build.build_records(refs, tfr_result, wb_results, static_data, computed_data)
    choice, _details = diagnostics.choose_tfr_transform(records, _transform_factor_ids(records))
    policy_data = policies_mod.load_policies(policies_path) if os.path.exists(policies_path) else {}
    return emit.write_bundle(records, choice, snapshot_year, out_dir, policies=policy_data)
```

Add `import os` at the top of `run.py` if not present, and add a `--policies` arg (default `data/policies.csv`) to `main`'s argparser, passing `policies_path=args.policies` into `run_pipeline`.

- [ ] **Step 7: Run the full pipeline suite**

Run: `.venv/bin/pytest -q`
Expected: PASS (all existing + new). Confirms the US path (which calls `write_bundle` without `policies`) is unaffected.

- [ ] **Step 8: Commit**

```bash
git add data-pipeline/fertility_pipeline/emit.py data-pipeline/fertility_pipeline/run.py data-pipeline/data/schema/policies.schema.json data-pipeline/tests/test_emit.py
git commit -m "feat(pipeline): emit standalone policies.json + policyCoverage (world only)"
```

---

### Task 3: Web policy types + loader (`lib/policy.ts`)

**Files:**
- Create: `web/src/lib/policy.ts`
- Test: `web/src/lib/policy.test.ts`

**Interfaces:**
- Produces:
  - `interface PolicyMeasures { baby_bonus: boolean | null; parental_leave: boolean | null; childcare_subsidy: boolean | null; tax_incentive: boolean | null; }`
  - `interface Policy { iso_num: number; iso3: string; stance: "raise" | "maintain" | "lower" | "none" | null; measures: PolicyMeasures; notes: string | null; }`
  - `loadPolicies(baseUrl?: string): Promise<Policy[]>` — fetches `${baseUrl}/policies.json`, returns `[]` on any non-ok/error (so a missing file never breaks the app).
  - `indexPoliciesByIsoNum(policies: Policy[]): Map<number, Policy>`.

- [ ] **Step 1: Write the failing test**

Create `web/src/lib/policy.test.ts`:

```ts
import { afterEach, test, expect, vi } from "vitest";
import { loadPolicies, indexPoliciesByIsoNum, type Policy } from "./policy";

afterEach(() => vi.unstubAllGlobals());

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/policy.test.ts`
Expected: FAIL — cannot find module `./policy`.

- [ ] **Step 3: Write the implementation**

Create `web/src/lib/policy.ts`:

```ts
export interface PolicyMeasures {
  baby_bonus: boolean | null;
  parental_leave: boolean | null;
  childcare_subsidy: boolean | null;
  tax_incentive: boolean | null;
}

export interface Policy {
  iso_num: number;
  iso3: string;
  stance: "raise" | "maintain" | "lower" | "none" | null;
  measures: PolicyMeasures;
  notes: string | null;
}

export async function loadPolicies(baseUrl = "/data"): Promise<Policy[]> {
  try {
    const res = await fetch(`${baseUrl}/policies.json`);
    if (!res.ok) return [];
    return (await res.json()) as Policy[];
  } catch {
    return [];
  }
}

export function indexPoliciesByIsoNum(policies: Policy[]): Map<number, Policy> {
  const m = new Map<number, Policy>();
  for (const p of policies) m.set(p.iso_num, p);
  return m;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/policy.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/policy.ts web/src/lib/policy.test.ts
git commit -m "feat(web): policy types + loader (tolerant of missing file)"
```

---

### Task 4: MapView hatch overlay + Legend swatch

**Files:**
- Modify: `web/src/components/MapView.tsx`
- Modify: `web/src/components/Legend.tsx`
- Test: `web/src/components/MapView.test.tsx` (append), `web/src/components/Legend.test.tsx` (append)

**Interfaces:**
- Consumes: `Policy` + `indexPoliciesByIsoNum` from Task 3.
- Produces: `MapView` gains props `policyByIsoNum?: Map<number, Policy>` and `policyOn?: boolean` (default undefined/false). When `policyOn`, it renders a diagonal-hatch overlay path (fill `url(#policy-hatch)`, `pointerEvents="none"`) for every feature whose policy `stance === "raise"`. `Legend` gains `policyOn?: boolean`; when true it renders a hatch swatch labelled "Pronatalist policy (raising fertility)".

- [ ] **Step 1: Write the failing MapView test**

Append to `web/src/components/MapView.test.tsx` (reuse the file's existing `MapView` import and `render` from testing-library). Two tests — overlay present for `raise` only, and absent when off:

```tsx
test("renders a policy hatch overlay only for raise countries when policyOn", () => {
  const topo = {
    type: "Topology",
    arcs: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    objects: { countries: { type: "GeometryCollection", geometries: [
      { type: "Polygon", id: "250", arcs: [[0]], properties: { name: "France" } },
      { type: "Polygon", id: "840", arcs: [[0]], properties: { name: "United States" } },
    ] } },
  };
  const byIsoNum = new Map<number, any>([
    [250, { iso3: "FRA", iso_num: 250, name: "France", region: "R", tfr: 1.8, tfr_year: 2022, factors: {} }],
    [840, { iso3: "USA", iso_num: 840, name: "USA", region: "R", tfr: 1.6, tfr_year: 2022, factors: {} }],
  ]);
  const policyByIsoNum = new Map<number, any>([
    [250, { iso_num: 250, iso3: "FRA", stance: "raise", measures: {}, notes: null }],
    [840, { iso_num: 840, iso3: "USA", stance: "none", measures: {}, notes: null }],
  ]);
  const fit = { factorIds: [], transform: "raw" as const, n: 0, r2: null, intercept: NaN, coefficients: {}, fits: new Map() };
  const { container } = render(
    <MapView topo={topo} byIsoNum={byIsoNum} fit={fit} mode="raw" selectedIso3={null}
      onSelect={() => {}} dark={false} policyByIsoNum={policyByIsoNum} policyOn />
  );
  const hatch = container.querySelectorAll('path[fill="url(#policy-hatch)"]');
  expect(hatch.length).toBe(1); // only FRA (raise); USA (none) gets none
});

test("no policy hatch overlay when policyOn is false", () => {
  const topo = {
    type: "Topology",
    arcs: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
    objects: { countries: { type: "GeometryCollection", geometries: [
      { type: "Polygon", id: "250", arcs: [[0]], properties: { name: "France" } },
    ] } },
  };
  const byIsoNum = new Map<number, any>([
    [250, { iso3: "FRA", iso_num: 250, name: "France", region: "R", tfr: 1.8, tfr_year: 2022, factors: {} }],
  ]);
  const policyByIsoNum = new Map<number, any>([
    [250, { iso_num: 250, iso3: "FRA", stance: "raise", measures: {}, notes: null }],
  ]);
  const fit = { factorIds: [], transform: "raw" as const, n: 0, r2: null, intercept: NaN, coefficients: {}, fits: new Map() };
  const { container } = render(
    <MapView topo={topo} byIsoNum={byIsoNum} fit={fit} mode="raw" selectedIso3={null}
      onSelect={() => {}} dark={false} policyByIsoNum={policyByIsoNum} policyOn={false} />
  );
  expect(container.querySelectorAll('path[fill="url(#policy-hatch)"]').length).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/MapView.test.tsx`
Expected: FAIL — no element matches `path[fill="url(#policy-hatch)"]`.

- [ ] **Step 3: Implement MapView overlay**

In `web/src/components/MapView.tsx`:

1. Add to imports: `import type { Policy } from "../lib/policy";`
2. Extend `MapViewProps`:

```tsx
  policyByIsoNum?: Map<number, Policy>;
  policyOn?: boolean;
```

3. Destructure them in the component: `const { topo, byIsoNum, fit, mode, selectedIso3, onSelect, dark, projectionKind = "world", objectName = "countries", policyByIsoNum, policyOn } = props;` (merge with the existing destructure — keep the projection/object props added earlier).
4. Inside the returned `<svg>`, add a `<defs>` as the first child, and after the base `features.map(...)` block add the overlay:

```tsx
      <defs>
        <pattern id="policy-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke={dark ? "#fff" : "#111"} strokeWidth="1.3" strokeOpacity="0.55" />
        </pattern>
      </defs>
```

and, after the existing `{features.map(...)}` path list:

```tsx
      {policyOn && policyByIsoNum && features.map((feat, i) => {
        const p = policyByIsoNum.get(Number(feat.id));
        if (!p || p.stance !== "raise") return null;
        return (
          <path
            key={`pol-${feat.id != null ? String(feat.id) : i}`}
            d={path(feat as any) ?? undefined}
            fill="url(#policy-hatch)"
            stroke="none"
            pointerEvents="none"
          />
        );
      })}
```

- [ ] **Step 4: Run MapView test to verify it passes**

Run: `cd web && npx vitest run src/components/MapView.test.tsx`
Expected: PASS (existing + new).

- [ ] **Step 5: Write the failing Legend test**

Append to `web/src/components/Legend.test.tsx`:

```tsx
test("shows a pronatalist-policy swatch when policyOn", () => {
  render(<Legend mode="residual" policyOn />);
  expect(screen.getByText(/pronatalist policy/i)).toBeInTheDocument();
});

test("no policy swatch when policyOn is false", () => {
  render(<Legend mode="residual" />);
  expect(screen.queryByText(/pronatalist policy/i)).not.toBeInTheDocument();
});
```

(Ensure `screen` is imported in this test file; add it to the existing `@testing-library/react` import if missing.)

- [ ] **Step 6: Run Legend test to verify it fails**

Run: `cd web && npx vitest run src/components/Legend.test.tsx`
Expected: FAIL — text not found.

- [ ] **Step 7: Implement Legend swatch**

Replace the contents of `web/src/components/Legend.tsx` with:

```tsx
import { residualLegendStops, rawLegendStops } from "../lib/scales";

export function Legend({ mode, policyOn }: { mode: "raw" | "residual"; policyOn?: boolean }) {
  const stops = mode === "residual" ? residualLegendStops() : rawLegendStops();
  const left = mode === "residual" ? "lower than expected" : "0.8";
  const right = mode === "residual" ? "higher than expected" : "7+";
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 6 }}>
        <span>{left}</span>
        <div style={{ display: "flex", flex: 1, borderRadius: 3, overflow: "hidden" }}>
          {stops.map((s) => (
            <div key={s.value} style={{ flex: 1, height: 12, background: s.color }} />
          ))}
        </div>
        <span>{right}</span>
      </div>
      {policyOn && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, marginTop: 6 }}>
          <svg width="18" height="12" aria-hidden="true">
            <defs>
              <pattern id="policy-hatch-legend" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="1.3" strokeOpacity="0.7" />
              </pattern>
            </defs>
            <rect width="18" height="12" fill="url(#policy-hatch-legend)" stroke="rgba(128,128,128,0.5)" />
          </svg>
          <span>Pronatalist policy (raising fertility)</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Run Legend test + full web suite**

Run: `cd web && npm run test`
Expected: PASS (all).

- [ ] **Step 9: Commit**

```bash
git add web/src/components/MapView.tsx web/src/components/MapView.test.tsx web/src/components/Legend.tsx web/src/components/Legend.test.tsx
git commit -m "feat(web): policy hatch overlay on the map + legend swatch"
```

---

### Task 5: App wiring + world-only policy toggle in ControlPanel

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/ControlPanel.tsx`
- Test: `web/src/App.integration.test.tsx` (append), `web/src/components/ControlPanel.test.tsx` (append)

**Interfaces:**
- Consumes: `loadPolicies`, `indexPoliciesByIsoNum`, `Policy` (Task 3); `MapView`/`Legend` policy props (Task 4).
- Produces: `App` holds `policyOn` state (default `false`), loads world policies once into `policies` state, indexes them, and passes `policyByIsoNum` + `policyOn` to `MapView` and `policyOn` to `Legend` **only at world scale**. `ControlPanel` gains optional props `policyOn?: boolean` and `onSetPolicy?: (v: boolean) => void`; when `onSetPolicy` is provided it renders a "Pronatalist policy" checkbox. App passes these only when `scale === "world"`.

- [ ] **Step 1: Write the failing ControlPanel test**

Append to `web/src/components/ControlPanel.test.tsx` (reuse existing `factors`/props helpers in the file; pass the new props):

```tsx
test("renders a pronatalist-policy toggle when onSetPolicy is provided", () => {
  const onSetPolicy = vi.fn();
  render(
    <ControlPanel factors={[]} selected={new Set()} onToggleFactor={() => {}}
      mode="residual" onSetMode={() => {}} r2={null} n={0}
      policyOn={false} onSetPolicy={onSetPolicy} />
  );
  const cb = screen.getByLabelText(/pronatalist policy/i);
  fireEvent.click(cb);
  expect(onSetPolicy).toHaveBeenCalledWith(true);
});

test("no policy toggle when onSetPolicy is omitted", () => {
  render(
    <ControlPanel factors={[]} selected={new Set()} onToggleFactor={() => {}}
      mode="residual" onSetMode={() => {}} r2={null} n={0} />
  );
  expect(screen.queryByLabelText(/pronatalist policy/i)).not.toBeInTheDocument();
});
```

(Ensure `vi`, `fireEvent`, `screen` are imported in this test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/ControlPanel.test.tsx`
Expected: FAIL — no element labelled "pronatalist policy".

- [ ] **Step 3: Implement ControlPanel toggle**

In `web/src/components/ControlPanel.tsx`, extend `ControlPanelProps`:

```tsx
  policyOn?: boolean;
  onSetPolicy?: (v: boolean) => void;
```

Destructure `policyOn` and `onSetPolicy` in the component. Immediately after the mode-toggle `<div>` (the one containing the residual/raw buttons), add:

```tsx
      {onSetPolicy && (
        <label style={{ display: "block", marginBottom: 12, fontSize: 13 }}>
          <input
            type="checkbox"
            aria-label="Pronatalist policy"
            checked={!!policyOn}
            onChange={(e) => onSetPolicy(e.target.checked)}
          />{" "}
          Pronatalist policy overlay
        </label>
      )}
```

- [ ] **Step 4: Run ControlPanel test to verify it passes**

Run: `cd web && npx vitest run src/components/ControlPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing App integration test**

Append to `web/src/App.integration.test.tsx`. This uses a path-aware mock so world policies load. Model it on the existing tests' structure:

```tsx
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
```

(Ensure the US-branch `us-states-10m.json` fetch also resolves to a valid empty topo; reuse the existing US topo constant from the earlier scale-switch test if present, otherwise return `{ type: "Topology", arcs: [], objects: { states: { type: "GeometryCollection", geometries: [] } } }` for the topo URL under `/us` handling.)

- [ ] **Step 6: Run test to verify it fails**

Run: `cd web && npx vitest run src/App.integration.test.tsx`
Expected: FAIL — no "pronatalist policy" toggle (App doesn't render it yet).

- [ ] **Step 7: Implement App wiring**

In `web/src/App.tsx`:

1. Add imports:

```tsx
import { loadPolicies, indexPoliciesByIsoNum } from "./lib/policy";
import type { Policy } from "./lib/policy";
```

2. Add state near the other `useState`s:

```tsx
  const [policyOn, setPolicyOn] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);
```

3. In the initial data-loading `useEffect` (the one calling `loadBundle("/data")`), also load world policies:

```tsx
    loadPolicies("/data").then(setPolicies);
```

4. Compute the policy index (memoized), gated to world scale:

```tsx
  const policyByIsoNum = useMemo(() => indexPoliciesByIsoNum(policies), [policies]);
```

5. In the map render for the world scale, pass the props to `MapView` and `Legend`. The map branch currently renders `<MapView ... />` and `<Legend mode={mode} />`. For the world scale, pass `policyByIsoNum={policyByIsoNum}` and `policyOn={policyOn}` to `MapView`, and `policyOn={policyOn}` to `Legend`. (At US scale, omit them — pass nothing, so the overlay never shows.)
6. Pass the policy toggle to `ControlPanel` **only at world scale**:

```tsx
          <ControlPanel
            factors={activeBundle.factors}
            selected={selected}
            onToggleFactor={toggle}
            mode={mode}
            onSetMode={setMode}
            r2={fit.r2}
            n={fit.n}
            {...(scale === "world" ? { policyOn, onSetPolicy: setPolicyOn } : {})}
          />
```

(Adapt to the exact prop names already used for `ControlPanel` in `App.tsx` — `activeBundle` is the active-scale bundle. Do not change existing props; only add the spread.)

- [ ] **Step 8: Run the full web suite + build**

Run: `cd web && npm run test && npm run build`
Expected: PASS (all tests) and a clean build.

- [ ] **Step 9: Commit**

```bash
git add web/src/App.tsx web/src/components/ControlPanel.tsx web/src/App.integration.test.tsx web/src/components/ControlPanel.test.tsx
git commit -m "feat(web): wire policy overlay — world-only toggle, map + legend"
```

---

### Task 6: DetailPanel policy section + About methodology

**Files:**
- Modify: `web/src/components/DetailPanel.tsx`
- Modify: `web/src/views/AboutView.tsx`
- Test: `web/src/components/DetailPanel.test.tsx` (append), `web/src/views/AboutView.test.tsx` (append)

**Interfaces:**
- Consumes: `Policy` from Task 3.
- Produces: `DetailPanel` gains an optional prop `policy?: Policy | null`; when present it renders a "Policy" section: the stance in plain language and the measures present. `AboutView` gains a static "Pronatalist policy" section explaining the overlay-not-covariate rationale and sources.

- [ ] **Step 1: Write the failing DetailPanel test**

Append to `web/src/components/DetailPanel.test.tsx` (reuse the file's helpers for building a `country` + `fit`; the key addition is the `policy` prop):

```tsx
test("shows the policy stance and measures when a policy is provided", () => {
  const country = { iso3: "FRA", iso_num: 250, name: "France", region: "Europe & Central Asia",
    tfr: 1.8, tfr_year: 2022, factors: { gdp_pc: 1 } };
  const fit = { factorIds: ["gdp_pc"], transform: "raw" as const, n: 3, r2: 0.5, intercept: 0,
    coefficients: { gdp_pc: -0.1 },
    fits: new Map([["FRA", { predictedTfr: 1.9, residualTfr: -0.1, contributions: { gdp_pc: -0.1 } }]]) };
  const policy = { iso_num: 250, iso3: "FRA", stance: "raise" as const,
    measures: { baby_bonus: true, parental_leave: true, childcare_subsidy: false, tax_incentive: null }, notes: null };
  render(<DetailPanel country={country} fit={fit} factors={[{ id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB" }]} policy={policy} />);
  expect(screen.getByText(/raise fertility/i)).toBeInTheDocument();
  expect(screen.getByText(/baby bonus/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/DetailPanel.test.tsx`
Expected: FAIL — "raise fertility" text not found.

- [ ] **Step 3: Implement DetailPanel policy section**

In `web/src/components/DetailPanel.tsx`:

1. Add import: `import type { Policy } from "../lib/policy";`
2. Extend props: `policy?: Policy | null;` (add to `DetailPanelProps` and destructure).
3. Add constants above the component:

```tsx
const STANCE_LABEL: Record<string, string> = {
  raise: "raise fertility",
  maintain: "maintain fertility",
  lower: "lower fertility",
  none: "no intervention",
};
const MEASURE_LABEL: Record<string, string> = {
  baby_bonus: "Baby bonus",
  parental_leave: "Parental leave",
  childcare_subsidy: "Childcare subsidy",
  tax_incentive: "Tax incentives",
};
```

4. Render a policy block. The early-return-when-no-`cf` branch should still work; add the policy section to BOTH the normal render and (optionally) keep it out of the insufficient-data branch for simplicity. In the main returned JSX, before the closing `</div>`, add:

```tsx
      {policy && (
        <div style={{ marginTop: 10, borderTop: "1px solid rgba(128,128,128,0.25)", paddingTop: 8 }}>
          <div style={{ fontSize: 11, opacity: 0.7 }}>pronatalist policy</div>
          <div>Government policy: <strong>{policy.stance ? STANCE_LABEL[policy.stance] : "no data"}</strong></div>
          {Object.entries(MEASURE_LABEL).map(([k, lbl]) => {
            const v = (policy.measures as Record<string, boolean | null>)[k];
            return (
              <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                <span>{lbl}</span>
                <span>{v == null ? "—" : v ? "yes" : "no"}</span>
              </div>
            );
          })}
        </div>
      )}
```

- [ ] **Step 4: Run DetailPanel test to verify it passes**

Run: `cd web && npx vitest run src/components/DetailPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire the selected country's policy in App**

In `web/src/App.tsx`, where `DetailPanel` is rendered, pass the selected country's policy at world scale:

```tsx
              <DetailPanel
                country={selectedCountry}
                fit={fit}
                factors={activeBundle.factors}
                policy={scale === "world" && selectedCountry ? policyByIsoNum.get(selectedCountry.iso_num) ?? null : null}
              />
```

(Only add the `policy` prop; keep the other DetailPanel props exactly as they are.)

- [ ] **Step 6: Write the failing About test**

Append to `web/src/views/AboutView.test.tsx` (reuse the existing `bundle` fixture):

```tsx
test("explains the pronatalist-policy overlay and that it is not a covariate", () => {
  render(<AboutView bundle={bundle} />);
  expect(screen.getByRole("heading", { name: /pronatalist policy/i })).toBeInTheDocument();
  expect(screen.getByText(/not.*(covariate|predictor)/i)).toBeInTheDocument();
});
```

- [ ] **Step 7: Run About test to verify it fails**

Run: `cd web && npx vitest run src/views/AboutView.test.tsx`
Expected: FAIL — heading not found.

- [ ] **Step 8: Implement About section**

In `web/src/views/AboutView.tsx`, add a section (place it after the existing methodology content, near the sub-national section if present):

```tsx
      <section>
        <h3>Pronatalist policy</h3>
        <p>
          The optional overlay hatches countries whose government policy is to <em>raise</em>
          fertility, using the UN World Population Policies database (stance and specific
          measures such as baby bonuses, parental leave, childcare subsidies, and tax
          incentives), enriched by the OECD Family Database. Click a country for its stance
          and measures.
        </p>
        <p>
          Policy is shown as an overlay and is deliberately <strong>not</strong> a predictor
          (covariate) in the model: pronatalist policy is usually a reaction to already-low
          fertility, so including it would produce misleading reverse-causality associations.
          Coverage is present-day and partial; a country with no reported policy shows "no data".
        </p>
      </section>
```

- [ ] **Step 9: Run the full web suite + build**

Run: `cd web && npm run test && npm run build`
Expected: PASS (all) + clean build.

- [ ] **Step 10: Commit**

```bash
git add web/src/components/DetailPanel.tsx web/src/views/AboutView.tsx web/src/App.tsx web/src/components/DetailPanel.test.tsx web/src/views/AboutView.test.tsx
git commit -m "feat(web): policy detail section + About methodology"
```

---

### Task 7: Data acquisition — `build_policies.py` + populate `policies.csv` + emit world bundle (CONTROLLER)

**Files:**
- Create: `data-pipeline/scripts/build_policies.py`
- Create/populate: `data-pipeline/data/policies.csv`
- Regenerate: `web/public/data/policies.json` + world `meta.json`

This task is executed by the controller (network + sourcing judgment), mirroring the US-states data step. It is NOT dispatched to a fresh subagent.

- [ ] **Step 1: Write `build_policies.py`**

A script that assembles `data/policies.csv` from authoritative sources: the UN World Population Policies "government policy on fertility level" classification (stance) and fertility-policy measures module, enriched by the OECD Family Database for measures. Keyed by ISO3 via the existing `data/countries_ref.csv`. Mirror `build_static_factors.py`'s structure (fetch → map name/code → ISO3 → write CSV with a coverage printout). Missing values written as empty (never guessed).

- [ ] **Step 2: Run it (network) and sanity-check coverage**

```bash
cd data-pipeline && .venv/bin/python scripts/build_policies.py
```

If the UN datasets endpoint is still under maintenance, source the stance from the most recent reachable authoritative artifact (UN WPP 2021 fertility-policies dataset/report; OECD Family Database for measures). Sanity-check: known pronatalist countries (France, Korea, Hungary, Japan, Singapore) show `stance=raise`; a clearly non-pronatalist country is not `raise`. Log coverage (# countries with a stance).

- [ ] **Step 3: Regenerate the world bundle**

```bash
cd data-pipeline && .venv/bin/python -m fertility_pipeline.run --policies data/policies.csv
```

Confirm `web/public/data/policies.json` exists, `meta.json` has `policyCoverage`, and the US bundle under `web/public/data/us/` is unchanged (no `policies.json` there).

- [ ] **Step 4: Verify in the app + tests**

Run `cd web && npm run test && npm run build`. Toggle the overlay on in the preview; confirm hatching appears on pronatalist countries and the detail panel shows stance + measures.

- [ ] **Step 5: Commit**

```bash
git add data-pipeline/scripts/build_policies.py data-pipeline/data/policies.csv web/public/data/policies.json web/public/data/meta.json
git commit -m "data(policy): API-sourced pronatalist policy CSV + emitted world overlay"
```

---

## Notes for the executor

- Tasks 1–2 are pipeline (offline, deterministic fixtures). Tasks 3–6 are web (offline, test-mocked). Task 7 is the controller data step (network; may be blocked by UN site maintenance — if so, the UI still ships against the contract with whatever coverage is obtainable, and the CSV is backfilled later, exactly like the US social-capital gap).
- Do not add policy to `factors.json` or the regression under any circumstance (Global Constraints).
- The US bundle must never gain a `policies.json` (the US run calls `write_bundle` without `policies`).
