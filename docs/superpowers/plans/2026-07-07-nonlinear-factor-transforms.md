# Non-linear Factor Transforms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each regression factor a data-chosen per-factor transform (raw/log) and an optional quadratic term, so non-linear predictors (GDP, possibility, enrolment) are fit correctly.

**Architecture:** The pipeline decides `{transform, quadratic}` per factor per scale (empirically, against the transformed target) and writes them into `factors.json`. The browser `fitModel` applies the transform, standardizes, adds a standardized squared column for curved factors, and reports one combined contribution per factor. Residual meaning is unchanged.

**Tech Stack:** Python (numpy) + pytest; React/TS + ml-matrix + Vitest.

## Global Constraints

- Transforms are **automatic/data-driven**, never a user toggle.
- Backward compatibility: a factor missing `transform`/`quadratic` behaves exactly as today (raw, linear). `write_bundle` without `factor_transforms` emits all `raw`/`false`.
- `transform ∈ {"raw","log"}`; `log` only when every value of that factor is > 0. `quadratic` is a boolean.
- Thresholds (verbatim): `LOG_MIN_GAIN = 0.01`, `MIN_N = 30`; `quad_min_gain` = **0.02 (world)**, **0.05 (US)**.
- Residual = actual − predicted TFR (unchanged). One combined contribution per factor (linear + quadratic) so the UI stays one row per factor.

---

### Task 1: `choose_factor_transforms` (pipeline decision)

**Files:**
- Modify: `data-pipeline/fertility_pipeline/diagnostics.py`
- Test: `data-pipeline/tests/test_diagnostics.py` (append)

**Interfaces:**
- Produces: `choose_factor_transforms(records, factor_ids, target_transform, quad_min_gain) -> dict[str, dict]`, returning `{fid: {"transform": "raw"|"log", "quadratic": bool}}`. Module constants `LOG_MIN_GAIN = 0.01`, `MIN_N = 30`.

- [ ] **Step 1: Write the failing tests**

Append to `data-pipeline/tests/test_diagnostics.py`:

```python
import math
from fertility_pipeline import diagnostics


def _recs(xs, ys, fid="f"):
    return [{"tfr": y, "factors": {fid: x}} for x, y in zip(xs, ys)]


def test_chooses_log_for_log_linear_factor():
    # y = 2 - 0.3*log(x); x spans a wide positive range -> log wins
    xs = [math.exp(i / 5) for i in range(60)]           # 1 .. ~e^11
    ys = [2.0 - 0.3 * math.log(x) for x in xs]
    out = diagnostics.choose_factor_transforms(_recs(xs, ys), ["f"], "raw", 0.02)
    assert out["f"]["transform"] == "log"


def test_chooses_raw_for_linear_factor():
    xs = [float(i) for i in range(60)]
    ys = [3.0 - 0.02 * x for x in xs]
    out = diagnostics.choose_factor_transforms(_recs(xs, ys), ["f"], "raw", 0.02)
    assert out["f"]["transform"] == "raw"
    assert out["f"]["quadratic"] is False


def test_no_log_when_a_value_is_non_positive():
    xs = [float(i) for i in range(-5, 55)]               # includes 0 and negatives
    ys = [2.0 - 0.01 * x for x in xs]
    out = diagnostics.choose_factor_transforms(_recs(xs, ys), ["f"], "raw", 0.02)
    assert out["f"]["transform"] == "raw"


def test_flags_quadratic_for_curved_factor():
    xs = [float(i) for i in range(-30, 30)]
    ys = [2.0 + 0.002 * x * x for x in xs]               # pure parabola
    out = diagnostics.choose_factor_transforms(_recs(xs, ys), ["f"], "raw", 0.02)
    assert out["f"]["quadratic"] is True


def test_small_n_is_raw_and_linear():
    xs = [math.exp(i / 3) for i in range(10)]            # n < MIN_N
    ys = [2.0 - 0.3 * math.log(x) for x in xs]
    out = diagnostics.choose_factor_transforms(_recs(xs, ys), ["f"], "raw", 0.02)
    assert out["f"] == {"transform": "raw", "quadratic": False}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_diagnostics.py -k "transform or quadratic or non_positive or small_n" -v`
Expected: FAIL — `choose_factor_transforms` not defined.

- [ ] **Step 3: Implement the decision function**

Append to `data-pipeline/fertility_pipeline/diagnostics.py`:

```python
LOG_MIN_GAIN = 0.01
MIN_N = 30


def _r2(cols, y):
    """R^2 of an OLS of y on the given predictor columns (n x k), with intercept."""
    design = np.column_stack([np.ones(len(y)), cols])
    beta, *_ = np.linalg.lstsq(design, y, rcond=None)
    resid = y - design @ beta
    ss_res = float((resid ** 2).sum())
    ss_tot = float(((y - y.mean()) ** 2).sum())
    return 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0


def choose_factor_transforms(records, factor_ids, target_transform, quad_min_gain):
    out = {}
    for fid in factor_ids:
        xs, ys = [], []
        for r in records:
            tfr = r.get("tfr")
            x = r["factors"].get(fid)
            if tfr is None or tfr <= 0 or x is None:
                continue
            xs.append(x)
            ys.append(tfr)
        x = np.asarray(xs, dtype=float)
        y = np.asarray(ys, dtype=float)
        yt = np.log(y) if target_transform == "log" else y

        transform, quadratic = "raw", False
        if len(x) >= MIN_N and x.std() > 0:
            if x.min() > 0:
                r2_raw = _r2(x[:, None], yt)
                r2_log = _r2(np.log(x)[:, None], yt)
                if r2_log - r2_raw >= LOG_MIN_GAIN:
                    transform = "log"
            v = np.log(x) if transform == "log" else x
            z = (v - v.mean()) / (v.std() or 1.0)
            r2_lin = _r2(z[:, None], yt)
            r2_quad = _r2(np.column_stack([z, z * z]), yt)
            if r2_quad - r2_lin >= quad_min_gain:
                quadratic = True
        out[fid] = {"transform": transform, "quadratic": quadratic}
    return out
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/pytest tests/test_diagnostics.py -v`
Expected: PASS (existing + 5 new).

- [ ] **Step 5: Commit**

```bash
git add data-pipeline/fertility_pipeline/diagnostics.py data-pipeline/tests/test_diagnostics.py
git commit -m "feat(pipeline): choose_factor_transforms (per-factor log + quadratic decision)"
```

---

### Task 2: Emit per-factor transforms + schema + wire pipelines

**Files:**
- Modify: `data-pipeline/fertility_pipeline/emit.py`
- Modify: `data-pipeline/data/schema/factors.schema.json`
- Modify: `data-pipeline/fertility_pipeline/run.py`
- Modify: `data-pipeline/fertility_pipeline/us_states.py`
- Test: `data-pipeline/tests/test_emit.py` (append)

**Interfaces:**
- Consumes: `diagnostics.choose_factor_transforms` (Task 1).
- Produces: `write_bundle(records, transform_choice, snapshot_year, out_dir, registry=_default_registry, policies=None, factor_transforms=None)`. When `factor_transforms` (a `{fid: {transform, quadratic}}` map) is given, each factor object in `factors.json` carries `transform` and `quadratic`; when absent, every factor emits `transform="raw"`, `quadratic=False`.

- [ ] **Step 1: Write the failing test**

Append to `data-pipeline/tests/test_emit.py`:

```python
def test_factors_json_carries_transform_and_quadratic(tmp_path):
    from fertility_pipeline import emit
    records = [
        {"iso3": "FRA", "iso_num": 250, "name": "France", "region": "Europe & Central Asia",
         "tfr": 1.8, "tfr_year": 2022, "factors": {"gdp_pc": 1.0}},
    ]
    ft = {"gdp_pc": {"transform": "log", "quadratic": True}}
    emit.write_bundle(records, "log", 2023, tmp_path, factor_transforms=ft)
    import json
    factors = json.loads((tmp_path / "factors.json").read_text())["factors"]
    gdp = next(f for f in factors if f["id"] == "gdp_pc")
    assert gdp["transform"] == "log"
    assert gdp["quadratic"] is True


def test_factors_json_defaults_transform_when_absent(tmp_path):
    from fertility_pipeline import emit
    records = [
        {"iso3": "FRA", "iso_num": 250, "name": "France", "region": "Europe & Central Asia",
         "tfr": 1.8, "tfr_year": 2022, "factors": {"gdp_pc": 1.0}},
    ]
    emit.write_bundle(records, "log", 2023, tmp_path)
    import json
    factors = json.loads((tmp_path / "factors.json").read_text())["factors"]
    gdp = next(f for f in factors if f["id"] == "gdp_pc")
    assert gdp["transform"] == "raw"
    assert gdp["quadratic"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/pytest tests/test_emit.py -k "transform_and_quadratic or defaults_transform" -v`
Expected: FAIL — `write_bundle()` got an unexpected keyword `factor_transforms`.

- [ ] **Step 3: Update the schema**

In `data-pipeline/data/schema/factors.schema.json`, add `transform` and `quadratic` to the factor item's `required` and `properties`:

```json
        "required": ["id", "label", "group", "unit", "direction", "source", "transform", "quadratic"],
        "properties": {
          "id": {"type": "string"},
          "label": {"type": "string"},
          "group": {"type": "string"},
          "unit": {"type": "string"},
          "direction": {"enum": ["positive", "negative", "mixed"]},
          "source": {"type": "string"},
          "transform": {"enum": ["raw", "log"]},
          "quadratic": {"type": "boolean"}
        }
```

- [ ] **Step 4: Thread `factor_transforms` through emit**

In `data-pipeline/fertility_pipeline/emit.py`, change `_build_factors_json` to take the map and attach the fields:

```python
def _build_factors_json(snapshot_year: int, transform_choice: str, registry, factor_transforms) -> dict:
    ft = factor_transforms or {}
    return {
        "snapshotYear": snapshot_year,
        "target": {
            "id": registry.TARGET.id,
            "label": registry.TARGET.label,
            "transform": transform_choice,
            "unit": registry.TARGET.unit,
            "source": registry.TARGET.source,
        },
        "factors": [
            {"id": f.id, "label": f.label, "group": f.group,
             "unit": f.unit, "direction": f.direction, "source": f.source,
             "transform": ft.get(f.id, {}).get("transform", "raw"),
             "quadratic": ft.get(f.id, {}).get("quadratic", False)}
            for f in registry.FACTORS
        ],
    }
```

Then update `write_bundle`'s signature and its call to `_build_factors_json`:

```python
def write_bundle(records, transform_choice, snapshot_year, out_dir, registry=_default_registry,
                 policies=None, factor_transforms=None):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    factors_json = _build_factors_json(snapshot_year, transform_choice, registry, factor_transforms)
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

(Keep the `_build_meta`/`_build_policies_json`/`_validate` bodies unchanged.)

- [ ] **Step 5: Wire the world + US pipelines**

In `data-pipeline/fertility_pipeline/run.py`, replace the last two lines of `run_pipeline` (the `choose_tfr_transform` + `return emit.write_bundle(...)`) with:

```python
    choice, _details = diagnostics.choose_tfr_transform(records, _transform_factor_ids(records))
    factor_transforms = diagnostics.choose_factor_transforms(
        records, registry.factor_ids(), choice, quad_min_gain=0.02)
    return emit.write_bundle(records, choice, snapshot_year, out_dir,
                             policies=policy_data, factor_transforms=factor_transforms)
```

In `data-pipeline/fertility_pipeline/us_states.py`, replace the `choose_tfr_transform` + `return emit.write_bundle(...)` lines with:

```python
    choice, _ = diagnostics.choose_tfr_transform(records, _transform_factor_ids(records))
    factor_transforms = diagnostics.choose_factor_transforms(
        records, factors_us.factor_ids(), choice, quad_min_gain=0.05)
    return emit.write_bundle(records, choice, SNAPSHOT_YEAR, out_dir, registry=factors_us,
                             factor_transforms=factor_transforms)
```

(`run.py` already imports `registry` as the country `factors` module and `diagnostics`; `us_states.py` already imports `factors_us` and `diagnostics`.)

- [ ] **Step 6: Run the full pipeline suite**

Run: `.venv/bin/pytest -q`
Expected: PASS — new emit tests plus all existing (existing emit tests that don't pass `factor_transforms` now see `transform="raw"`/`quadratic=False` on every factor, which the updated schema requires and allows).

- [ ] **Step 7: Commit**

```bash
git add data-pipeline/fertility_pipeline/emit.py data-pipeline/data/schema/factors.schema.json data-pipeline/fertility_pipeline/run.py data-pipeline/fertility_pipeline/us_states.py data-pipeline/tests/test_emit.py
git commit -m "feat(pipeline): emit per-factor transform/quadratic into factors.json"
```

---

### Task 3: `fitModel` — apply transform + quadratic, combined contributions

**Files:**
- Modify: `web/src/types.ts`
- Modify: `web/src/lib/regression.ts`
- Modify: `web/src/App.tsx`
- Test: `web/src/lib/regression.test.ts` (rewrite calls + add cases)

**Interfaces:**
- Produces: `fitModel(units, factors: FactorSpec[], transform)` where `interface FactorSpec { id: string; transform?: "raw" | "log"; quadratic?: boolean }`. `FactorMeta` gains optional `transform?: "raw" | "log"` and `quadratic?: boolean`. `FitResult` is unchanged in shape (`factorIds`, `transform`, `n`, `r2`, `intercept`, `coefficients` [linear per factor], `fits` with one combined contribution per factor).

- [ ] **Step 1: Add the type fields**

In `web/src/types.ts`, add to `FactorMeta`:

```ts
  transform?: "raw" | "log";
  quadratic?: boolean;
```

- [ ] **Step 2: Write the failing tests**

Replace the body of `web/src/lib/regression.test.ts` with (updates existing calls to the new signature + adds transform/quadratic cases):

```ts
import { fitModel } from "./regression";
import type { Country } from "../types";

function units(rows: { iso3: string; tfr: number; x: number }[]): Country[] {
  return rows.map((r) => ({
    iso3: r.iso3, iso_num: 0, name: r.iso3, region: "R",
    tfr: r.tfr, tfr_year: 2022, factors: { x: r.x },
  }));
}

test("raw single factor still fits a line (backward compatible)", () => {
  const cs = units(Array.from({ length: 20 }, (_, i) => ({ iso3: `C${i}`, tfr: 1 + 0.1 * i, x: i })));
  const fit = fitModel(cs, [{ id: "x" }], "raw");
  expect(fit.n).toBe(20);
  expect(fit.r2).not.toBeNull();
  expect(fit.r2 as number).toBeGreaterThan(0.99); // exact line
});

test("zero selected factors => insufficient (null R2, no fits)", () => {
  const cs = units(Array.from({ length: 20 }, (_, i) => ({ iso3: `C${i}`, tfr: 1 + 0.1 * i, x: i })));
  const fit = fitModel(cs, [], "raw");
  expect(fit.r2).toBeNull();
  expect(fit.fits.size).toBe(0);
});

test("log transform fits a log-linear factor far better than raw", () => {
  // tfr = 3 - 0.5*ln(x)
  const rows = Array.from({ length: 40 }, (_, i) => {
    const x = Math.exp(i / 6);
    return { iso3: `C${i}`, tfr: 3 - 0.5 * Math.log(x), x };
  });
  const raw = fitModel(units(rows), [{ id: "x", transform: "raw" }], "raw");
  const log = fitModel(units(rows), [{ id: "x", transform: "log" }], "raw");
  expect(log.r2 as number).toBeGreaterThan(raw.r2 as number);
  expect(log.r2 as number).toBeGreaterThan(0.999); // exact after log
});

test("quadratic captures a parabola a linear term cannot", () => {
  // tfr = 2 + 0.01*x^2, x symmetric about 0 -> linear term ~0, needs x^2
  const rows = Array.from({ length: 40 }, (_, i) => {
    const x = i - 20;
    return { iso3: `C${i}`, tfr: 2 + 0.01 * x * x, x };
  });
  const lin = fitModel(units(rows), [{ id: "x" }], "raw");
  const quad = fitModel(units(rows), [{ id: "x", quadratic: true }], "raw");
  expect(lin.r2 as number).toBeLessThan(0.2);
  expect(quad.r2 as number).toBeGreaterThan(0.99);
});

test("contribution is the combined linear + quadratic term per factor", () => {
  const rows = Array.from({ length: 40 }, (_, i) => {
    const x = i - 20;
    return { iso3: `C${i}`, tfr: 2 + 0.01 * x * x, x };
  });
  const fit = fitModel(units(rows), [{ id: "x", quadratic: true }], "raw");
  const f = fit.fits.get("C0")!;
  // exactly one contribution entry for the factor (linear+quad combined)
  expect(Object.keys(f.contributions)).toEqual(["x"]);
  // predicted + residual reconstruct actual tfr
  expect(f.predictedTfr + f.residualTfr).toBeCloseTo(2 + 0.01 * 400, 6);
});

test("log factor excludes non-positive rows from the fit", () => {
  const rows = [
    ...Array.from({ length: 20 }, (_, i) => ({ iso3: `P${i}`, tfr: 2 - 0.1 * Math.log(i + 1), x: i + 1 })),
    { iso3: "ZERO", tfr: 2, x: 0 }, // dropped by the log guard
  ];
  const fit = fitModel(units(rows), [{ id: "x", transform: "log" }], "raw");
  expect(fit.n).toBe(20);
  expect(fit.fits.has("ZERO")).toBe(false);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd web && npx vitest run src/lib/regression.test.ts`
Expected: FAIL — signature/behaviour mismatch (fitModel takes string[] today).

- [ ] **Step 4: Rewrite `fitModel`**

Replace `web/src/lib/regression.ts` with:

```ts
import { Matrix, solve } from "ml-matrix";
import type { Country } from "../types";

export interface FactorSpec {
  id: string;
  transform?: "raw" | "log";
  quadratic?: boolean;
}

export interface CountryFit {
  predictedTfr: number;
  residualTfr: number;
  contributions: Record<string, number>;
}

export interface FitResult {
  factorIds: string[];
  transform: "raw" | "log";
  n: number;
  r2: number | null;
  intercept: number;
  coefficients: Record<string, number>;
  fits: Map<string, CountryFit>;
}

function empty(factorIds: string[], transform: "raw" | "log", n: number): FitResult {
  return { factorIds, transform, n, r2: null, intercept: NaN, coefficients: {}, fits: new Map() };
}

const isLog = (f: FactorSpec) => f.transform === "log";

export function fitModel(
  countries: Country[],
  factors: FactorSpec[],
  transform: "raw" | "log",
): FitResult {
  const factorIds = factors.map((f) => f.id);
  const complete = countries.filter(
    (c) =>
      c.tfr != null &&
      c.tfr > 0 &&
      factors.every((f) => c.factors[f.id] != null && (!isLog(f) || (c.factors[f.id] as number) > 0)),
  );
  const n = complete.length;
  const quadFactors = factors.filter((f) => f.quadratic);
  const nCols = factors.length + quadFactors.length;
  // Zero selected factors => nothing to "control for"; also need enough rows for the columns.
  if (factors.length === 0 || n < nCols + 2) return empty(factorIds, transform, n);

  const tval = (c: Country, f: FactorSpec) =>
    isLog(f) ? Math.log(c.factors[f.id] as number) : (c.factors[f.id] as number);

  // standardize each linear (transformed) term over complete cases
  const means: Record<string, number> = {};
  const stds: Record<string, number> = {};
  for (const f of factors) {
    const vals = complete.map((c) => tval(c, f));
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    means[f.id] = mean;
    stds[f.id] = variance === 0 ? 1 : Math.sqrt(variance);
  }
  const z = (c: Country, f: FactorSpec) => (tval(c, f) - means[f.id]) / stds[f.id];

  // standardize the squared term (z^2) for each curved factor
  const qmeans: Record<string, number> = {};
  const qstds: Record<string, number> = {};
  for (const f of quadFactors) {
    const qs = complete.map((c) => z(c, f) ** 2);
    const mean = qs.reduce((a, b) => a + b, 0) / n;
    const variance = qs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    qmeans[f.id] = mean;
    qstds[f.id] = variance === 0 ? 1 : Math.sqrt(variance);
  }
  const zq = (c: Country, f: FactorSpec) => (z(c, f) ** 2 - qmeans[f.id]) / qstds[f.id];

  const y = complete.map((c) => (transform === "log" ? Math.log(c.tfr as number) : (c.tfr as number)));
  // columns: [1, linear terms in factor order, quadratic terms in factor order]
  const X = complete.map((c) => [1, ...factors.map((f) => z(c, f)), ...quadFactors.map((f) => zq(c, f))]);

  const beta = solve(new Matrix(X), Matrix.columnVector(y), true).to1DArray();
  const intercept = beta[0];
  const linCoef: Record<string, number> = {};
  factors.forEach((f, j) => (linCoef[f.id] = beta[1 + j]));
  const quadCoef: Record<string, number> = {};
  quadFactors.forEach((f, j) => (quadCoef[f.id] = beta[1 + factors.length + j]));

  const fittedT = X.map((row) => row.reduce((s, v, j) => s + v * beta[j], 0));
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  const ssRes = y.reduce((s, yi, i) => s + (yi - fittedT[i]) ** 2, 0);
  const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const r2 = ssTot === 0 ? null : 1 - ssRes / ssTot;

  const fits = new Map<string, CountryFit>();
  complete.forEach((c, i) => {
    const predictedTfr = transform === "log" ? Math.exp(fittedT[i]) : fittedT[i];
    const contributions: Record<string, number> = {};
    for (const f of factors) {
      let contrib = linCoef[f.id] * z(c, f);
      if (f.quadratic) contrib += quadCoef[f.id] * zq(c, f);
      contributions[f.id] = contrib;
    }
    fits.set(c.iso3, {
      predictedTfr,
      residualTfr: (c.tfr as number) - predictedTfr,
      contributions,
    });
  });

  return { factorIds, transform, n, r2, intercept, coefficients: linCoef, fits };
}
```

- [ ] **Step 5: Run the regression tests**

Run: `cd web && npx vitest run src/lib/regression.test.ts`
Expected: PASS (all 6).

- [ ] **Step 6: Update the App call site**

In `web/src/App.tsx`, replace the `factorIds` + `fit` memos (currently around lines 61–67) with:

```tsx
  const selectedFactors = useMemo(
    () => (activeBundle ? activeBundle.factors.filter((f) => selected.has(f.id)) : []),
    [activeBundle, selected],
  );
  const fit = useMemo(
    () => (activeBundle ? fitModel(activeBundle.countries, selectedFactors, activeBundle.target.transform) : null),
    [activeBundle, selectedFactors],
  );
```

(Delete the old `factorIds` memo. `fitModel` now takes the filtered `FactorMeta[]`, which carry `transform`/`quadratic`. `FitResult.factorIds` still drives the DetailPanel, so no other consumer changes.)

- [ ] **Step 7: Run the full web suite + build**

Run: `cd web && npm run test && npm run build`
Expected: PASS (all) + clean build. (DetailPanel/scatter/table consume `fit.fits`/`fit.factorIds`, unchanged.)

- [ ] **Step 8: Commit**

```bash
git add web/src/types.ts web/src/lib/regression.ts web/src/App.tsx web/src/lib/regression.test.ts
git commit -m "feat(web): fitModel applies per-factor log + quadratic terms"
```

---

### Task 4: ControlPanel annotations + About note

**Files:**
- Modify: `web/src/components/ControlPanel.tsx`
- Modify: `web/src/views/AboutView.tsx`
- Test: `web/src/components/ControlPanel.test.tsx` (append), `web/src/views/AboutView.test.tsx` (append)

**Interfaces:**
- Consumes: `FactorMeta.transform`/`quadratic` (Task 3).
- Produces: a `(log)` suffix and a `curve` badge in the control panel; an About sentence.

- [ ] **Step 1: Write the failing ControlPanel test**

Append to `web/src/components/ControlPanel.test.tsx` (reuse the file's render + props shape):

```tsx
test("annotates logged and curved factors", () => {
  const factors = [
    { id: "gdp_pc", label: "GDP per capita", group: "Economic", unit: "$", direction: "negative", source: "WB", transform: "log", quadratic: false },
    { id: "possibility", label: "Possibility index", group: "Possibility", unit: "z", direction: "negative", source: "computed", transform: "raw", quadratic: true },
  ];
  render(
    <ControlPanel factors={factors as any} selected={new Set()} onToggleFactor={() => {}}
      mode="residual" onSetMode={() => {}} r2={null} n={0} />
  );
  expect(screen.getByText(/\(log\)/)).toBeInTheDocument();
  expect(screen.getByText("curve")).toBeInTheDocument();
});
```

(Ensure `screen` is imported in this test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/ControlPanel.test.tsx`
Expected: FAIL — no `(log)` / `curve` text.

- [ ] **Step 3: Add the annotations**

In `web/src/components/ControlPanel.tsx`, inside the factor `<label>` (right after `{f.label}` and before the existing `f.group === "Possibility"` badge), add:

```tsx
              {f.transform === "log" && <span style={{ opacity: 0.6 }}> (log)</span>}
              {f.quadratic && (
                <span style={{ marginLeft: 4, fontSize: 10, padding: "0 4px", borderRadius: 4, background: "#8ecae644", color: "inherit" }}>curve</span>
              )}
```

- [ ] **Step 4: Run ControlPanel test to verify it passes**

Run: `cd web && npx vitest run src/components/ControlPanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing About test**

Append to `web/src/views/AboutView.test.tsx` (reuse the existing `bundle` fixture):

```tsx
test("explains the per-factor transforms", () => {
  render(<AboutView bundle={bundle} />);
  expect(screen.getByText(/log|quadratic|curv/i)).toBeInTheDocument();
});
```

- [ ] **Step 6: Run About test to verify it fails**

Run: `cd web && npx vitest run src/views/AboutView.test.tsx`
Expected: FAIL — text not found.

- [ ] **Step 7: Add the About note**

In `web/src/views/AboutView.tsx`, add a `<section>` near the other methodology sections:

```tsx
      <section>
        <h3>Non-linear factors</h3>
        <p>
          Some predictors relate non-linearly to fertility, so each factor is given a
          data-chosen transform: a log transform where it straightens the relationship
          (e.g. GDP per capita), and an added quadratic ("curve") term where the shape is
          genuinely bent (e.g. the possibility index). These are picked empirically per
          scale by the data-prep stage; quadratic terms add parameters, so they are used
          conservatively — especially for US states, where the sample is small.
        </p>
      </section>
```

- [ ] **Step 8: Run the full web suite + build**

Run: `cd web && npm run test && npm run build`
Expected: PASS + clean build.

- [ ] **Step 9: Commit**

```bash
git add web/src/components/ControlPanel.tsx web/src/views/AboutView.tsx web/src/components/ControlPanel.test.tsx web/src/views/AboutView.test.tsx
git commit -m "feat(web): annotate logged/curved factors + About note"
```

---

### Task 5: Re-emit both bundles (CONTROLLER)

Executed by the controller (network: World Bank + Census + cached OSM). Not dispatched to a subagent.

- [ ] **Step 1: Re-emit the world bundle**

```bash
cd data-pipeline && .venv/bin/python -m fertility_pipeline.run --policies data/policies.csv
```
Confirm `web/public/data/factors.json` factor objects now carry `transform`/`quadratic`, with (per the analysis) `gdp_pc` → `transform:"log"`, `possibility` → `quadratic:true`, `fem_sec_enroll` → `quadratic:true`. `policies.json` + `policyCoverage` still present.

- [ ] **Step 2: Re-emit the US bundle**

```bash
cd data-pipeline && CENSUS_API_KEY=<key> .venv/bin/python -m fertility_pipeline.us_states --csv data/us_states.csv --out ../web/public/data/us --cache-dir out/raw/overpass_us
```
Confirm `web/public/data/us/factors.json` carries the fields, with `urbanisation` → `quadratic:true` and no `transform:"log"` (per the US analysis). US bundle still has no `policies.json`.

- [ ] **Step 3: Verify + commit**

Run `cd web && npm run test && npm run build`. Spot-check in the running app that GDP shows "(log)" and possibility shows the "curve" badge, and that toggling possibility now changes the residual map more than before. Then:

```bash
git add web/public/data/factors.json web/public/data/countries.json web/public/data/meta.json web/public/data/us/factors.json web/public/data/us/countries.json web/public/data/us/meta.json
git commit -m "data: re-emit bundles with per-factor transform/quadratic metadata"
```

---

## Notes for the executor

- Tasks 1–4 are offline (subagent-able). Task 5 is the controller data re-emit (network; the world OSM cache and Census key are available).
- Backward compatibility hinges on: `factor_transforms=None` → all `raw`/`false`; `FactorSpec` with undefined `transform`/`quadratic` → raw/linear (identical math to today). Existing tests that don't set these must still pass.
