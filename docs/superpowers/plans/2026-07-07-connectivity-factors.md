# Connectivity Factors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Connectivity" factor per scale — US-state smartphone adoption (ACS, replacing the empty religiosity factor) and world mobile subscriptions (World Bank) — and remove mobile from the Possibility composite so it stays a distinct predictor.

**Architecture:** Registry-driven. The factor registries (`factors_us.py`, `factors.py`) define the factors; the web app renders them generically by group. Smartphone is a US CSV column sourced by `build_us_states.py`; mobile_use is a World Bank factor fetched automatically by the existing world pipeline. Possibility loses its `mobile` component in `possibility.py`/`run.py`.

**Tech Stack:** Python (stdlib csv, requests), pytest; React/TS (no structural change), Vitest. Census ACS + World Bank APIs.

## Global Constraints

- No silent imputation — missing values stay null; smartphone/mobile are real sourced values only.
- Separate model per scale — US uses `smartphone` (% of households); world uses `mobile_use` (per 100 people); never mixed.
- `mobile_use` (world) must NOT also be a Possibility component — mobile is removed from the composite so it is a distinct predictor.
- Backward compatibility — the world country pipeline auto-fetches every `worldbank_factors()` entry; the US pipeline reads every `static_factors()` column from `us_states.csv`. Existing tests stay green.
- Static factor `code` == `id` in `factors_us` (CSV column name).

---

### Task 1: US registry — `smartphone` replaces `religiosity`

**Files:**
- Modify: `data-pipeline/fertility_pipeline/factors_us.py`
- Test: `data-pipeline/tests/test_factors_us.py`

**Interfaces:**
- Produces: `factors_us.FACTORS` gains a `smartphone` Factor (group "Connectivity", source "static", code "smartphone", direction "negative", unit "% of households") and loses `religiosity`. `GROUPS` replaces "Religiosity" with "Connectivity".

- [ ] **Step 1: Update the tests**

In `data-pipeline/tests/test_factors_us.py`, replace `test_expected_factor_ids_present` and `test_groups_include_possibility`, and add a religiosity-removed test:

```python
def test_expected_factor_ids_present():
    ids = set(factors_us.factor_ids())
    assert {
        "income_pc", "home_value", "fem_bachelors", "flfp",
        "urbanisation", "social_capital", "smartphone", "possibility",
    } <= ids


def test_religiosity_removed_smartphone_added():
    ids = set(factors_us.factor_ids())
    assert "religiosity" not in ids
    assert "smartphone" in ids
    assert "Religiosity" not in factors_us.GROUPS
    assert "Connectivity" in factors_us.GROUPS


def test_groups_include_possibility():
    assert "Possibility" in factors_us.GROUPS
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_factors_us.py -v`
Expected: FAIL — `religiosity` still present / `Connectivity` not in GROUPS.

- [ ] **Step 3: Update the registry**

In `data-pipeline/fertility_pipeline/factors_us.py`, change `GROUPS` (line 9) to:

```python
GROUPS = ["Economic", "Education", "Women's work & agency", "Structure", "Community", "Connectivity", "Possibility"]
```

and replace the `religiosity` Factor entry (currently between `social_capital` and `possibility`) with:

```python
    Factor(id="smartphone", label="Smartphone in household", group="Connectivity",
           source="static", code="smartphone", direction="negative", unit="% of households"),
```

- [ ] **Step 4: Run the full pipeline suite**

Run: `.venv/bin/pytest -q`
Expected: PASS (test_factors_us updated; test_us_states unaffected — its fixture columns are read by id and the removed/added column simply isn't asserted).

- [ ] **Step 5: Commit**

```bash
git add data-pipeline/fertility_pipeline/factors_us.py data-pipeline/tests/test_factors_us.py
git commit -m "feat(pipeline): US smartphone factor replaces religiosity (Connectivity group)"
```

---

### Task 2: World `mobile_use` factor + remove mobile from Possibility

**Files:**
- Modify: `data-pipeline/fertility_pipeline/factors.py`
- Modify: `data-pipeline/fertility_pipeline/possibility.py`
- Modify: `data-pipeline/fertility_pipeline/run.py`
- Test: `data-pipeline/tests/test_factors.py`, `data-pipeline/tests/test_possibility.py`, `data-pipeline/tests/test_run.py`

**Interfaces:**
- Produces: `factors.FACTORS` gains `mobile_use` (source "worldbank", code "IT.CEL.SETS.P2"); `factors.GROUPS` gains "Connectivity". `possibility.COMPONENTS` no longer contains "mobile". `run.POSSIBILITY_WB_CODES` no longer contains "mobile", and `build_possibility` no longer emits a "mobile" component.

- [ ] **Step 1: Write the failing tests**

Append to `data-pipeline/tests/test_factors.py`:

```python
def test_mobile_use_is_a_worldbank_connectivity_factor():
    f = next((f for f in factors.FACTORS if f.id == "mobile_use"), None)
    assert f is not None
    assert f.source == "worldbank"
    assert f.code == "IT.CEL.SETS.P2"
    assert f.group == "Connectivity"
    assert "Connectivity" in factors.GROUPS


def test_mobile_use_not_in_possibility_components():
    from fertility_pipeline import possibility
    assert "mobile" not in possibility.COMPONENTS
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/pytest tests/test_factors.py -k "mobile_use" -v`
Expected: FAIL — `mobile_use` factor not found / `mobile` still in COMPONENTS.

- [ ] **Step 3: Add the factor**

In `data-pipeline/fertility_pipeline/factors.py`, add `"Connectivity"` to `GROUPS` (before `"Possibility"`), and add this Factor to `FACTORS` (immediately after the `urbanisation` entry):

```python
    Factor(id="mobile_use", label="Mobile subscriptions", group="Connectivity", source="worldbank",
           code="IT.CEL.SETS.P2", direction="negative", unit="per 100 people"),
```

- [ ] **Step 4: Remove mobile from the Possibility composite**

In `data-pipeline/fertility_pipeline/possibility.py`, change line 3 to:

```python
COMPONENTS = ["amenity_density", "internet", "pop_density", "net_migration"]
```

In `data-pipeline/fertility_pipeline/run.py`, remove the `"mobile": "IT.CEL.SETS.P2",` line from `POSSIBILITY_WB_CODES`, and remove the `"mobile": {iso3: wb_val("mobile", iso3) for iso3 in iso2_by_iso3},` line from the `components` dict inside `build_possibility`.

- [ ] **Step 5: Update the possibility + run tests that referenced mobile**

In `data-pipeline/tests/test_possibility.py`, in `test_compute_requires_min_components`, remove the `"mobile": {...},` line from the `components` dict (the assertions still hold: B has only `amenity_density` present → `None`; A has 4 components → not `None`).

In `data-pipeline/tests/test_run.py`, in `test_build_possibility_combines_osm_and_wb`, remove the `"IT.CEL.SETS.P2": {...},` line from `fake_fetch`'s data (it is no longer queried; USA/NER still have ≥3 components so the existing assertions hold).

- [ ] **Step 6: Run the full pipeline suite**

Run: `.venv/bin/pytest -q`
Expected: PASS (all, including the updated possibility/run tests).

- [ ] **Step 7: Commit**

```bash
git add data-pipeline/fertility_pipeline/factors.py data-pipeline/fertility_pipeline/possibility.py data-pipeline/fertility_pipeline/run.py data-pipeline/tests/test_factors.py data-pipeline/tests/test_possibility.py data-pipeline/tests/test_run.py
git commit -m "feat(pipeline): world mobile_use factor; remove mobile from Possibility composite"
```

---

### Task 3: About-view Connectivity note

**Files:**
- Modify: `web/src/views/AboutView.tsx`
- Test: `web/src/views/AboutView.test.tsx`

**Interfaces:**
- Produces: a static sentence in AboutView noting the Connectivity factors and the mobile/Possibility-internet collinearity caveat.

- [ ] **Step 1: Write the failing test**

Append to `web/src/views/AboutView.test.tsx` (reuse the existing `bundle` fixture):

```tsx
test("notes the connectivity factors and the collinearity caveat", () => {
  render(<AboutView bundle={bundle} />);
  expect(screen.getByText(/connectivity/i)).toBeInTheDocument();
  expect(screen.getByText(/collinear/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/views/AboutView.test.tsx`
Expected: FAIL — text not found.

- [ ] **Step 3: Add the section**

In `web/src/views/AboutView.tsx`, add a `<section>` near the other methodology sections:

```tsx
      <section>
        <h3>Connectivity</h3>
        <p>
          Each scale includes a connectivity factor: for US states, the share of
          households with a smartphone (Census ACS); for countries, mobile-phone
          subscriptions per 100 people (World Bank). Because mobile subscriptions
          and the internet-use component of the Possibility index are correlated,
          selecting both the Possibility index and Mobile subscriptions together is
          collinear — the model still fits, but their individual coefficients
          become harder to interpret.
        </p>
      </section>
```

- [ ] **Step 4: Run the web suite + build**

Run: `cd web && npm run test && npm run build`
Expected: PASS + clean build.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/AboutView.tsx web/src/views/AboutView.test.tsx
git commit -m "docs(web): About note on Connectivity factors + collinearity caveat"
```

---

### Task 4: US data — source smartphone, re-emit US bundle (CONTROLLER)

Executed by the controller (network: Census ACS + re-emit). Not dispatched to a subagent.

- [ ] **Step 1: Rename the static lookup, dropping religiosity**

Rename `data-pipeline/data/us_social_religion.csv` → `data-pipeline/data/us_social_capital.csv`, keeping only the `iso3,social_capital` columns (drop the empty `religiosity` column).

- [ ] **Step 2: Update `build_us_states.py`**

- Add `"B28001_005E"` and `"B28001_001E"` to `DETAIL_VARS`.
- Add a `compute_smartphone(row)` helper: `B28001_005E / B28001_001E * 100`, rounded 1 dp, `None` if either is missing/zero.
- In the header list, replace the trailing `"religiosity"` column with `"smartphone"`.
- Rename `load_social_religion()` → `load_social_capital()` reading `us_social_capital.csv` (only `social_capital`).
- In the row build, replace `sr.get("social_capital", ""), sr.get("religiosity", "")` with `sr.get("social_capital", ""), fmt(compute_smartphone(d))`.
- Update the docstring (smartphone from ACS B28001; religiosity removed).

- [ ] **Step 3: Run it and sanity-check**

```bash
cd data-pipeline && CENSUS_API_KEY=<key> .venv/bin/python scripts/build_us_states.py
```
Confirm `us_states.csv` now has a `smartphone` column populated 51/51 (California ≈ 93–94%, plausible spread), no `religiosity` column.

- [ ] **Step 4: Re-emit the US bundle**

```bash
cd data-pipeline && CENSUS_API_KEY=<key> .venv/bin/python -m fertility_pipeline.us_states --csv data/us_states.csv --out ../web/public/data/us --cache-dir out/raw/overpass_us
```
Confirm `web/public/data/us/factors.json` lists `smartphone` (group Connectivity), not `religiosity`; `meta.json` coverage has `smartphone: 51`.

- [ ] **Step 5: Verify + commit**

Run `cd web && npm run build`. Then:

```bash
git add data-pipeline/scripts/build_us_states.py data-pipeline/data/us_social_capital.csv data-pipeline/data/us_states.csv web/public/data/us
git rm data-pipeline/data/us_social_religion.csv
git commit -m "data(us-states): source smartphone adoption from ACS B28001; drop religiosity"
```

---

### Task 5: World data — re-emit bundle with mobile_use + de-duplicated Possibility (CONTROLLER)

Executed by the controller (network: World Bank + OSM from cache). The world OSM cache (`out/raw/overpass`, 215 files) is intact, so no Overpass refetch.

- [ ] **Step 1: Re-emit the world bundle**

```bash
cd data-pipeline && .venv/bin/python -m fertility_pipeline.run --policies data/policies.csv
```
(The world run fetches all worldbank factors incl. the new `IT.CEL.SETS.P2`, recomputes Possibility without mobile, and re-emits. `--policies` keeps the pronatalist overlay data.)

- [ ] **Step 2: Sanity-check the emitted world bundle**

Confirm `web/public/data/factors.json` lists `mobile_use` (group Connectivity); `web/public/data/countries.json` has `mobile_use` populated for major countries (e.g. USA, France > 90 per 100); `meta.json` coverage has `mobile_use`; Possibility still 51+ covered and values are finite (shifted slightly vs before). Confirm `policies.json` is still present and `policyCoverage` intact.

- [ ] **Step 3: Verify + commit**

Run `cd web && npm run build`. Then:

```bash
git add web/public/data/countries.json web/public/data/factors.json web/public/data/meta.json
git commit -m "data(world): mobile_use factor + Possibility recomputed without mobile"
```

---

## Notes for the executor

- Tasks 1–3 are offline (subagent-able). Tasks 4–5 are controller data steps (network).
- The web app needs no structural change — the "Connectivity" group renders from the bundles automatically.
- Do not re-add mobile to the Possibility composite (Global Constraints).
