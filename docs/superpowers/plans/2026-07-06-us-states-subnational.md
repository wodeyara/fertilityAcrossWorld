# US States Sub-national Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a US-states sub-national scale (51 units) with its own data pipeline, its own OLS model, and a `World │ United States` scale selector across all four existing web views.

**Architecture:** The pipeline gains a US-state factor registry (`factors_us.py`) and a run path (`us_states.py`) that reuses the existing generic building blocks (`build_records`, `emit.write_bundle`, `choose_tfr_transform`, `compute_possibility`, `overpass`) by adding backward-compatible `registry=`/`tag=` parameters. It emits a bundle to `web/public/data/us/` using the **same JSON field names** (`iso3`, `iso_num`) as the world bundle — `iso3` = USPS code, `iso_num` = state FIPS — so the web app reuses the existing loader and all view/lib code unchanged. The web app renames the `Country` type to `GeoUnit` (keeping a `Country` alias and the field names), adds projection/topojson selection to `MapView`, and adds a scale selector to `App`.

**Tech Stack:** Python 3.12 (pandas-free; stdlib csv + numpy + scipy + jsonschema + requests + pytest); Vite + React 18 + TypeScript; d3-geo (`geoNaturalEarth1`, `geoAlbersUsa`, `geoPath`), topojson-client, ml-matrix; Vitest + @testing-library/react + jsdom.

## Global Constraints

- **No silent imputation.** A unit missing a selected factor is `null` in JSON and shown as "insufficient data" — never guessed.
- **Separate model per scale.** The US model is fit only on US units; never mixed with the country model.
- **Present-day only** for US states; label coverage as such. No historical snapshot.
- **Backward compatibility:** every generalization to a shared pipeline function (`emit.write_bundle`, `build.build_records`, `overpass.*`) MUST default to current behavior so the existing pytest suite passes unchanged. Every web change MUST keep the existing vitest suite green.
- **US unit identity:** `iso3` field = 2-letter USPS code (e.g. `CA`, `TX`, `DC`); `iso_num` field = integer state FIPS (e.g. `6`, `48`, `11`). These match the `us-atlas` `states-10m` topojson `id` (FIPS string, e.g. `"06"` → `Number("06")` = `6`).
- **Snapshot vintage:** target `~2022`; each source uses its latest clean release, recorded in `meta.json` / the About view.
- **Commit style:** end commit messages with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Run pipeline commands from `data-pipeline/`** using `.venv/bin/python` / `.venv/bin/pytest`. **Run web commands from `web/`** using `npm`.

---

## File Structure

**Pipeline (new):**
- `data-pipeline/fertility_pipeline/factors_us.py` — US-state factor registry (mirrors `factors.py` interface).
- `data-pipeline/fertility_pipeline/us_states.py` — US run path: load CSV, build possibility, emit bundle.
- `data-pipeline/scripts/build_us_states.py` — occasional data-acquisition script → commits `data/us_states.csv`.
- `data-pipeline/data/us_states.csv` — committed artifact (one row per state/DC).
- `data-pipeline/tests/test_factors_us.py`, `tests/test_us_states.py` — tests.
- `data-pipeline/tests/fixtures/us_states_sample.csv` — deterministic fixture for the run-path test.

**Pipeline (modified, backward-compatible):**
- `fertility_pipeline/emit.py` — `write_bundle(..., registry=<country module>)`.
- `fertility_pipeline/build.py` — `build_records(..., registry=<country module>)`.
- `fertility_pipeline/overpass.py` — `build_query(value, tag=...)`, `fetch_amenity_count(value, ..., tag=...)`, `fetch_all_amenity_counts(mapping, ..., tag=...)`.
- `data-pipeline/data/schema/countries.schema.json` — relax `iso3` to `minLength: 2`.

**Web (new):**
- `web/public/data/us/{countries,factors,meta}.json` — emitted US bundle.
- `web/public/data/us-states-10m.json` — us-atlas states topojson.

**Web (modified):**
- `web/src/types.ts` — rename `Country`→`GeoUnit` + alias + doc.
- `web/src/lib/geo.ts` — generalize `featuresFromTopo(topo, objectName, excludeName?)`.
- `web/src/components/MapView.tsx` — add `projectionKind` + `objectName` props.
- `web/src/App.tsx` — `scale` state + Scale selector + lazy US bundle/topo load + per-scale defaults.
- `web/src/views/AboutView.tsx` — US-states methodology section.

---

## Task 1: US-state factor registry (`factors_us.py`)

**Files:**
- Create: `data-pipeline/fertility_pipeline/factors_us.py`
- Test: `data-pipeline/tests/test_factors_us.py`

**Interfaces:**
- Consumes: `Factor` dataclass from `fertility_pipeline.factors`.
- Produces (module-level, mirrors the `factors` module so it can be passed as `registry=`): `TARGET: Factor`, `FACTORS: list[Factor]`, `GROUPS: list[str]`, `factor_ids() -> list[str]`, `static_factors() -> list[Factor]` (source == "static"), `computed_factors() -> list[Factor]` (source == "computed"). Factor `source` is one of `"static"` (a column in `us_states.csv`) or `"computed"` (Possibility). Factor `code` for static factors == the CSV column name.

- [ ] **Step 1: Write the failing test**

```python
# data-pipeline/tests/test_factors_us.py
from fertility_pipeline import factors_us
from fertility_pipeline.factors import Factor


def test_target_is_tfr():
    assert factors_us.TARGET.id == "tfr"
    assert isinstance(factors_us.TARGET, Factor)


def test_expected_factor_ids_present():
    ids = set(factors_us.factor_ids())
    assert {
        "income_pc", "home_value", "fem_bachelors", "flfp",
        "urbanisation", "social_capital", "possibility",
    } <= ids


def test_possibility_is_the_only_computed_factor():
    computed = [f.id for f in factors_us.computed_factors()]
    assert computed == ["possibility"]


def test_static_factor_codes_match_ids():
    # static factor `code` is the us_states.csv column name; keep it == id for clarity
    for f in factors_us.static_factors():
        assert f.code == f.id


def test_groups_include_possibility():
    assert "Possibility" in factors_us.GROUPS
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd data-pipeline && .venv/bin/pytest tests/test_factors_us.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'fertility_pipeline.factors_us'`.

- [ ] **Step 3: Write minimal implementation**

```python
# data-pipeline/fertility_pipeline/factors_us.py
"""US-state factor registry. Mirrors the `factors` module interface so it can be
passed as `registry=` to build_records / write_bundle.

Present-day snapshot only. Non-computed factors are columns in data/us_states.csv
(source="static", code == column name). Possibility is computed (see us_states.py).
"""
from .factors import Factor

GROUPS = ["Economic", "Education", "Women's work & agency", "Structure", "Community", "Religiosity", "Possibility"]

REGIONS = ["Northeast", "Midwest", "South", "West"]  # US Census regions

TARGET = Factor(
    id="tfr", label="Total fertility rate", group="Target", source="static",
    code="tfr", direction="mixed", unit="births per woman",
)

FACTORS = [
    Factor(id="income_pc", label="Per-capita personal income", group="Economic",
           source="static", code="income_pc", direction="negative", unit="US$"),
    Factor(id="home_value", label="Median home value", group="Economic",
           source="static", code="home_value", direction="negative", unit="US$"),
    Factor(id="fem_bachelors", label="Women 25+ with a bachelor's+", group="Education",
           source="static", code="fem_bachelors", direction="negative", unit="% of women 25+"),
    Factor(id="flfp", label="Female labour-force participation", group="Women's work & agency",
           source="static", code="flfp", direction="negative", unit="% of women 16+"),
    Factor(id="urbanisation", label="Urbanisation", group="Structure",
           source="static", code="urbanisation", direction="negative", unit="% urban"),
    Factor(id="social_capital", label="Social Capital Project index", group="Community",
           source="static", code="social_capital", direction="mixed", unit="index (z-like)"),
    Factor(id="religiosity", label="Highly religious (Pew)", group="Religiosity",
           source="static", code="religiosity", direction="positive", unit="% highly religious"),
    Factor(id="possibility", label="Possibility index", group="Possibility",
           source="computed", code="possibility", direction="negative", unit="z-score index"),
]


def factor_ids() -> list[str]:
    return [f.id for f in FACTORS]


def worldbank_factors() -> list[Factor]:
    return []


def static_factors() -> list[Factor]:
    return [f for f in FACTORS if f.source == "static"]


def computed_factors() -> list[Factor]:
    return [f for f in FACTORS if f.source == "computed"]
```

> Note: `religiosity` is included in the registry but may end up all-`null` if Pew data isn't cleanly sourced (Task 5); that's fine — coverage just reports 0 and the UI shows "insufficient data" when it's selected. `worldbank_factors()` is provided (returns `[]`) so the same `build_records` signature works.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd data-pipeline && .venv/bin/pytest tests/test_factors_us.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add data-pipeline/fertility_pipeline/factors_us.py data-pipeline/tests/test_factors_us.py
git commit -m "feat(pipeline): US-state factor registry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Generalize `build_records` and `write_bundle` to accept a registry

**Files:**
- Modify: `data-pipeline/fertility_pipeline/build.py`
- Modify: `data-pipeline/fertility_pipeline/emit.py`
- Modify: `data-pipeline/data/schema/countries.schema.json`
- Test: `data-pipeline/tests/test_emit.py` (add a case)

**Interfaces:**
- Produces: `build.build_records(refs, tfr_result, wb_results, static_data, computed_data=None, registry=factors)` and `emit.write_bundle(records, transform_choice, snapshot_year, out_dir, registry=factors)`. When `registry` is omitted, behavior is identical to today (country registry). `registry` must expose `TARGET`, `FACTORS`, `factor_ids()`, `worldbank_factors()`, `static_factors()`, `computed_factors()`.

- [ ] **Step 1: Write the failing test** (append to `tests/test_emit.py`)

```python
def test_write_bundle_accepts_us_registry(tmp_path):
    from fertility_pipeline import factors_us, emit
    records = [{
        "iso3": "CA", "iso_num": 6, "name": "California", "region": "West",
        "tfr": 1.52, "tfr_year": 2022,
        "factors": {fid: None for fid in factors_us.factor_ids()},
    }]
    records[0]["factors"]["income_pc"] = 41000.0
    records[0]["factors"]["possibility"] = 0.8
    meta = emit.write_bundle(records, "raw", 2022, tmp_path, registry=factors_us)
    import json
    factors_doc = json.loads((tmp_path / "factors.json").read_text())
    assert factors_doc["target"]["id"] == "tfr"
    assert {f["id"] for f in factors_doc["factors"]} == set(factors_us.factor_ids())
    assert meta["coverage"]["income_pc"] == 1
    assert meta["coverage"]["home_value"] == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd data-pipeline && .venv/bin/pytest tests/test_emit.py::test_write_bundle_accepts_us_registry -v`
Expected: FAIL — `write_bundle() got an unexpected keyword argument 'registry'`.

- [ ] **Step 3: Implement — `emit.py`**

Change the top import and add a `registry` parameter threaded into the two builders:

```python
# emit.py — replace `from . import factors as registry` usage
from . import factors as _default_registry


def _build_factors_json(snapshot_year: int, transform_choice: str, registry) -> dict:
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
             "unit": f.unit, "direction": f.direction, "source": f.source}
            for f in registry.FACTORS
        ],
    }


def _build_meta(records: list[dict], snapshot_year: int, registry) -> dict:
    coverage = {fid: 0 for fid in registry.factor_ids()}
    with_tfr = 0
    for r in records:
        if r["tfr"] is not None:
            with_tfr += 1
        for fid, val in r["factors"].items():
            if val is not None:
                coverage[fid] = coverage.get(fid, 0) + 1
    return {"snapshotYear": snapshot_year, "countryCount": len(records),
            "withTfr": with_tfr, "coverage": coverage}


def write_bundle(records, transform_choice, snapshot_year, out_dir, registry=_default_registry) -> dict:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    factors_json = _build_factors_json(snapshot_year, transform_choice, registry)
    meta = _build_meta(records, snapshot_year, registry)
    _validate(records, "countries.schema.json")
    _validate(factors_json, "factors.schema.json")
    (out / "factors.json").write_text(json.dumps(factors_json, indent=2))
    (out / "countries.json").write_text(json.dumps(records, indent=2))
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta
```

(Delete the old module-level `from . import factors as registry` line; keep `import json`, `from pathlib import Path`, `import jsonschema`, `SCHEMA_DIR`, `_validate`.)

- [ ] **Step 4: Implement — `build.py`**

Add a `registry` parameter (default the country module):

```python
# build.py
from . import factors as _default_registry
from .countries_ref import CountryRef


def build_records(refs, tfr_result, wb_results, static_data, computed_data=None, registry=_default_registry):
    computed_data = computed_data or {}
    all_ids = registry.factor_ids()
    wb_ids = [f.id for f in registry.worldbank_factors()]
    static_ids = [f.id for f in registry.static_factors()]
    computed_ids = [f.id for f in registry.computed_factors()]
    # ... (rest of the body is unchanged) ...
```

(Replace `from . import factors as registry` with the `_default_registry` import; the function body below `all_ids = ...` is otherwise identical.)

- [ ] **Step 5: Relax the schema — `countries.schema.json`**

Change the `iso3` property so US postal codes (2 chars) validate while country codes (3) still do:

```json
"iso3": {"type": "string", "minLength": 2, "maxLength": 3},
```

- [ ] **Step 6: Run the full pipeline suite**

Run: `cd data-pipeline && .venv/bin/pytest -q`
Expected: PASS — all existing tests still green (defaults preserve behavior) plus the new `test_write_bundle_accepts_us_registry`.

- [ ] **Step 7: Commit**

```bash
git add data-pipeline/fertility_pipeline/build.py data-pipeline/fertility_pipeline/emit.py data-pipeline/data/schema/countries.schema.json data-pipeline/tests/test_emit.py
git commit -m "refactor(pipeline): registry-parameterize build_records and write_bundle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Generalize Overpass to filter by an arbitrary boundary tag

**Files:**
- Modify: `data-pipeline/fertility_pipeline/overpass.py`
- Test: `data-pipeline/tests/test_overpass.py` (add cases)

**Interfaces:**
- Produces: `build_query(value, tag="ISO3166-1:alpha2")`, `fetch_amenity_count(value, session=None, url=..., tag="ISO3166-1:alpha2")`, `fetch_all_amenity_counts(mapping, cache_dir, session=None, sleep=None, tag="ISO3166-1:alpha2")`. `mapping` is `{key: area_value}`; results are keyed by `key`; cache files are named by `area_value`. Defaults reproduce today's country behavior exactly.

- [ ] **Step 1: Write the failing tests** (append to `tests/test_overpass.py`)

```python
def test_query_supports_iso3166_2_tag():
    q = overpass.build_query("US-CA", tag="ISO3166-2")
    assert '["ISO3166-2"="US-CA"]' in q
    assert "out count;" in q


def test_fetch_all_threads_tag_and_keys_by_mapping_key(tmp_path):
    session = FakeSession(FIXTURE)
    out = overpass.fetch_all_amenity_counts(
        {"CA": "US-CA"}, tmp_path, session=session, sleep=lambda s: None, tag="ISO3166-2",
    )
    assert out == {"CA": 1350}
    # query used the state tag; cache file named by the area value
    assert '["ISO3166-2"="US-CA"]' in session.calls[0][1]["data"]
    assert (tmp_path / "US-CA.json").exists()
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd data-pipeline && .venv/bin/pytest tests/test_overpass.py -k "iso3166_2 or threads_tag" -v`
Expected: FAIL — `build_query()` takes 1 positional arg / TypeError on `tag`.

- [ ] **Step 3: Implement** (edit the three functions)

```python
def build_query(value: str, tag: str = "ISO3166-1:alpha2") -> str:
    regex = "^(" + "|".join(AMENITY_TAGS) + ")$"
    return (
        f"[out:json][timeout:{QUERY_TIMEOUT}];"
        f'area["{tag}"="{value}"]->.a;'
        f'nwr["amenity"~"{regex}"](area.a);'
        "out count;"
    )


def fetch_amenity_count(value: str, session=None, url: str = OVERPASS_URL, tag: str = "ISO3166-1:alpha2") -> int:
    if session is None:
        session = requests
    resp = session.post(url, data={"data": build_query(value, tag=tag)}, headers=HEADERS, timeout=QUERY_TIMEOUT + 30)
    resp.raise_for_status()
    return parse_count(resp.json())


def fetch_all_amenity_counts(mapping, cache_dir, session=None, sleep=None, tag: str = "ISO3166-1:alpha2") -> dict[str, int]:
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    if sleep is None:
        sleep = lambda s: time.sleep(s)
    out: dict[str, int] = {}
    for key, value in sorted(mapping.items()):
        cache_file = cache / f"{value}.json"
        if cache_file.exists():
            total = json.loads(cache_file.read_text()).get("total")
            if total is not None:
                out[key] = int(total)
            continue
        try:
            count = fetch_amenity_count(value, session=session, tag=tag)
            cache_file.write_text(json.dumps({"value": value, "total": count}))
            out[key] = count
        except (OverpassError, requests.RequestException):
            cache_file.write_text(json.dumps({"value": value, "total": None}))
        sleep(1.0)
    return out
```

> The parameter rename `iso2_by_iso3` → `mapping` and `iso3, iso2` → `key, value` is internal; callers (run.py) pass positionally so they're unaffected. The cache JSON key changes from `"iso2"` to `"value"` — harmless (only `"total"` is read back).

- [ ] **Step 4: Run the overpass suite**

Run: `cd data-pipeline && .venv/bin/pytest tests/test_overpass.py -v`
Expected: PASS — the 8 existing tests (country defaults) + the 2 new state-tag tests.

- [ ] **Step 5: Commit**

```bash
git add data-pipeline/fertility_pipeline/overpass.py data-pipeline/tests/test_overpass.py
git commit -m "feat(pipeline): overpass area filter by arbitrary boundary tag (ISO3166-2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: US run path (`us_states.py`) with fixture-driven test

**Files:**
- Create: `data-pipeline/fertility_pipeline/us_states.py`
- Create: `data-pipeline/tests/fixtures/us_states_sample.csv`
- Test: `data-pipeline/tests/test_us_states.py`

**Interfaces:**
- Consumes: `countries_ref.CountryRef`, `build.build_records`, `emit.write_bundle`, `diagnostics.choose_tfr_transform`, `possibility.compute_possibility`, `overpass.fetch_all_amenity_counts`, `factors_us`.
- Produces:
  - `load_us_states(csv_path) -> tuple[dict[str, CountryRef], dict[str, tuple[float, int]], dict[str, dict[str, float | None]]]` returning `(refs, tfr, raw)` keyed by USPS code; `raw[code]` holds every numeric column (incl. `population`, `broadband`) as `float | None`.
  - `build_us_possibility(raw, osm_counts) -> dict[str, dict[str, float | None]]` → `{code: {"possibility": value}}`.
  - `run_us_pipeline(csv_path, out_dir, cache_dir, osm_fetch=None) -> dict` (returns meta).
- CSV columns (header): `iso3,iso_num,name,region,tfr,tfr_year,population,broadband,income_pc,home_value,fem_bachelors,flfp,urbanisation,social_capital,religiosity`. `iso3`=USPS, `iso_num`=FIPS. Empty cell → `None`.

- [ ] **Step 1: Create the fixture CSV**

```csv
iso3,iso_num,name,region,tfr,tfr_year,population,broadband,income_pc,home_value,fem_bachelors,flfp,urbanisation,social_capital,religiosity
CA,6,California,West,1.52,2022,39000000,89.0,41000,700000,36.0,58.0,95.0,-0.2,0.28
UT,49,Utah,West,1.92,2022,3300000,91.0,32000,420000,34.0,61.0,90.0,1.1,0.66
VT,50,Vermont,Northeast,1.48,2022,647000,85.0,38000,270000,42.0,60.0,35.0,1.4,0.34
TX,48,Texas,South,1.86,2022,30000000,86.0,34000,300000,32.0,59.0,84.0,-0.1,0.47
```

(The test's OSM counts are injected, so amenity counts aren't in the CSV.)

- [ ] **Step 2: Write the failing test**

```python
# data-pipeline/tests/test_us_states.py
import json
from pathlib import Path

from fertility_pipeline import us_states, factors_us

FIXTURE = Path(__file__).parent / "fixtures" / "us_states_sample.csv"


def test_load_us_states_parses_identity_and_raw():
    refs, tfr, raw = us_states.load_us_states(FIXTURE)
    assert refs["CA"].iso_num == 6
    assert refs["CA"].name == "California"
    assert refs["CA"].region == "West"
    assert tfr["UT"] == (1.92, 2022)
    assert raw["CA"]["population"] == 39000000.0
    assert raw["VT"]["broadband"] == 85.0


def test_build_us_possibility_yields_value_and_degrades():
    _, _, raw = us_states.load_us_states(FIXTURE)
    counts = {"CA": 120000, "UT": 8000, "VT": 1800}  # TX intentionally missing OSM
    comp = us_states.build_us_possibility(raw, counts)
    # states with >=3 present components get a value
    assert comp["CA"]["possibility"] is not None
    # TX has no amenity_density but still has broadband+urbanisation+income (3) -> value
    assert comp["TX"]["possibility"] is not None


def test_run_us_pipeline_emits_valid_bundle(tmp_path):
    out = tmp_path / "us"
    cache = tmp_path / "osm"
    fake_osm = lambda mapping, cache_dir, tag=None: {"CA": 120000, "UT": 8000, "VT": 1800, "TX": 40000}
    meta = us_states.run_us_pipeline(FIXTURE, out, cache, osm_fetch=fake_osm)
    countries = json.loads((out / "countries.json").read_text())
    factors_doc = json.loads((out / "factors.json").read_text())
    assert meta["countryCount"] == 4
    assert factors_doc["target"]["transform"] in ("raw", "log")
    ca = next(c for c in countries if c["iso3"] == "CA")
    assert ca["iso_num"] == 6
    assert ca["factors"]["possibility"] is not None
    assert ca["factors"]["income_pc"] == 41000.0
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd data-pipeline && .venv/bin/pytest tests/test_us_states.py -v`
Expected: FAIL — `No module named 'fertility_pipeline.us_states'`.

- [ ] **Step 4: Implement `us_states.py`**

```python
"""US-states run path. Present-day snapshot only.

Reads the committed data/us_states.csv, computes the state Possibility index
(OSM amenities per capita + broadband + urbanisation + income), lets diagnostics
choose the TFR transform, and emits a bundle to web/public/data/us/ using the
same field names as the country bundle (iso3=USPS code, iso_num=state FIPS).
"""
import argparse
import csv

from . import factors_us, build, emit, diagnostics, overpass, possibility
from .countries_ref import CountryRef

SNAPSHOT_YEAR = 2022
TRANSFORM_MIN_COVERAGE = 0.6
POSSIBILITY_SCALE = 1000.0  # amenities per 1,000 people

# Non-factor numeric columns used only for Possibility.
_EXTRA_NUMERIC = ["population", "broadband"]


def _to_float(raw: str):
    raw = (raw or "").strip()
    if not raw:
        return None
    return float(raw)


def load_us_states(csv_path):
    refs, tfr, raw = {}, {}, {}
    numeric_cols = [f.code for f in factors_us.static_factors()] + _EXTRA_NUMERIC
    with open(csv_path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            code = row["iso3"].strip().upper()
            refs[code] = CountryRef(
                iso3=code, iso_num=int(row["iso_num"].strip()),
                name=row["name"].strip(), region=row["region"].strip(),
            )
            t = _to_float(row.get("tfr"))
            if t is not None:
                year = int(float(row["tfr_year"].strip())) if (row.get("tfr_year") or "").strip() else SNAPSHOT_YEAR
                tfr[code] = (t, year)
            raw[code] = {col: _to_float(row.get(col)) for col in numeric_cols}
    return refs, tfr, raw


def build_us_possibility(raw, osm_counts):
    amenity_density, broadband, urbanisation, income = {}, {}, {}, {}
    for code, cols in raw.items():
        pop = cols.get("population")
        cnt = osm_counts.get(code)
        amenity_density[code] = (cnt / pop * POSSIBILITY_SCALE) if (pop and cnt is not None and pop > 0) else None
        broadband[code] = cols.get("broadband")
        urbanisation[code] = cols.get("urbanisation")
        income[code] = cols.get("income_pc")
    components = {
        "amenity_density": amenity_density,
        "broadband": broadband,
        "urbanisation": urbanisation,
        "income": income,
    }
    values = possibility.compute_possibility(components)
    return {code: {"possibility": values.get(code)} for code in raw}


def _transform_factor_ids(records):
    n_tfr = sum(1 for r in records if r["tfr"] is not None)
    if n_tfr == 0:
        return []
    covered = []
    for fid in factors_us.factor_ids():
        cov = sum(1 for r in records if r["tfr"] is not None and r["factors"].get(fid) is not None)
        if cov >= TRANSFORM_MIN_COVERAGE * n_tfr:
            covered.append(fid)
    return covered


def run_us_pipeline(csv_path, out_dir, cache_dir, osm_fetch=None):
    if osm_fetch is None:
        osm_fetch = overpass.fetch_all_amenity_counts
    refs, tfr, raw = load_us_states(csv_path)
    # ISO3166-2 area value for each state, e.g. CA -> "US-CA".
    mapping = {code: f"US-{code}" for code in refs}
    osm_counts = osm_fetch(mapping, cache_dir, tag="ISO3166-2")
    computed = build_us_possibility(raw, osm_counts)
    records = build.build_records(refs, tfr, {}, raw, computed, registry=factors_us)
    choice, _ = diagnostics.choose_tfr_transform(records, _transform_factor_ids(records))
    return emit.write_bundle(records, choice, SNAPSHOT_YEAR, out_dir, registry=factors_us)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build the US-states fertility bundle.")
    parser.add_argument("--csv", default="data/us_states.csv")
    parser.add_argument("--out", default="../web/public/data/us")
    parser.add_argument("--cache-dir", default="out/raw/overpass_us")
    args = parser.parse_args(argv)
    meta = run_us_pipeline(args.csv, args.out, args.cache_dir)
    print(f"Wrote US bundle to {args.out}/ — {meta['countryCount']} units, {meta['withTfr']} with TFR.")


if __name__ == "__main__":
    main()
```

> `build.build_records` receives `raw` as `static_data`; it only reads the static factor ids, so the extra `population`/`broadband` keys are ignored there (they feed Possibility only). The `osm_fetch` test double accepts `tag=None` to match the keyword call.

- [ ] **Step 5: Run the test**

Run: `cd data-pipeline && .venv/bin/pytest tests/test_us_states.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Full pipeline suite**

Run: `cd data-pipeline && .venv/bin/pytest -q`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add data-pipeline/fertility_pipeline/us_states.py data-pipeline/tests/test_us_states.py data-pipeline/tests/fixtures/us_states_sample.csv
git commit -m "feat(pipeline): US-states run path + state Possibility index

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Acquire real US data, build the bundle (network, best-effort)

**Files:**
- Create: `data-pipeline/scripts/build_us_states.py`
- Create (committed artifact): `data-pipeline/data/us_states.csv`
- Create (emitted, committed): `web/public/data/us/{countries,factors,meta}.json`
- Cache dir (gitignored like the country OSM cache): `data-pipeline/out/raw/overpass_us/`

**Interfaces:**
- Consumes: Census ACS API, plus published tables for CDC TFR, Census urban %, JEC Social Capital, Pew (optional). Produces the committed `data/us_states.csv` with the columns from Task 4.

This task mirrors `scripts/build_static_factors.py`: an occasional build step whose **committed CSV is the artifact of record**. Automate what has a clean API (ACS); hand-populate the rest from published tables and cite them in the script docstring. Missing values stay empty (→ `null`), never guessed.

- [ ] **Step 1: Write `build_us_states.py`**

Fetch from the Census ACS 2022 1-year API (keyless works for `for=state:*`), compute derived measures, and merge the non-API sources. Concrete endpoints/variables (verify ids against the live API and adjust if a variable moved — the CSV is the source of truth):

```python
"""Populate data/us_states.csv from public sources (occasional build step).

  income_pc, home_value, population, fem_bachelors  <- Census ACS 2022 1-yr detailed tables
  flfp, broadband                                   <- Census ACS 2022 1-yr data profiles (DP03, DP02)
  urbanisation      <- 2020 Census Urban/Rural (published state % urban)   [hand-populated]
  social_capital    <- JEC Social Capital Project state index (2018)        [hand-populated]
  religiosity       <- Pew Religious Landscape Study, % highly religious     [hand-populated, optional]
  tfr, tfr_year     <- CDC NCHS Births: Final Data for 2022 (NVSR), state TFR table [hand-populated]

Run from data-pipeline/:  .venv/bin/python scripts/build_us_states.py
"""
import csv
import io
from pathlib import Path
import requests

DATA = Path(__file__).resolve().parent.parent / "data"
ACS = "https://api.census.gov/data/2022/acs/acs1"
ACS_PROFILE = "https://api.census.gov/data/2022/acs/acs1/profile"

# USPS code + FIPS + Census region for the 50 states + DC (source of truth for identity columns).
STATES = [
    # (fips, usps, name, region) ... 51 rows; e.g.:
    ("06", "CA", "California", "West"),
    ("49", "UT", "Utah", "West"),
    # ... fill all 51 (50 states + DC="11","DC","District of Columbia","South") ...
]

# Detailed-table variables (verify against ACS):
#   B01003_001E population; B19301_001E per-capita income; B25077_001E median home value;
#   B15002_019E female 25+ total; B15002_032E..035E female bachelor's/master's/professional/doctorate.
DETAIL_VARS = "B01003_001E,B19301_001E,B25077_001E,B15002_019E,B15002_032E,B15002_033E,B15002_034E,B15002_035E"
# Profile variables (verify against ACS profile): DP03 female LFP, DP02 broadband %.
#   DP03_0110E females 16+, DP03_0111E in labor force; DP02_0154PE broadband subscription %.
PROFILE_VARS = "DP03_0110E,DP03_0111E,DP02_0154PE"


def _fetch(url, get):
    resp = requests.get(url, params={"get": "NAME," + get, "for": "state:*"}, timeout=120)
    resp.raise_for_status()
    rows = resp.json()
    header = rows[0]
    return {r[header.index("state")]: dict(zip(header, r)) for r in rows[1:]}  # keyed by FIPS


def main():
    detail = _fetch(ACS, DETAIL_VARS)
    profile = _fetch(ACS_PROFILE, PROFILE_VARS)

    # Hand-populated tables (paste published values; leave blank if unavailable). Keyed by USPS.
    URBAN = {"CA": 95.0, "UT": 90.0, "VT": 35.0, ...}          # 2020 Census % urban
    SOCIAL = {"CA": -0.2, "UT": 1.1, "VT": 1.4, ...}           # JEC Social Capital Index
    RELIG = {"CA": 0.28, "UT": 0.66, "VT": 0.34, ...}          # Pew % highly religious (optional)
    TFR = {"CA": (1.52, 2022), "UT": (1.92, 2022), ...}        # CDC NCHS state TFR

    def f(d, fips, key):
        v = (d.get(fips, {}).get(key) or "").strip()
        return v if v not in ("", "-666666666", "null") else ""

    rows = []
    for fips, usps, name, region in STATES:
        d, p = detail.get(fips, {}), profile.get(fips, {})
        # fem_bachelors %: (bachelor's+master's+prof+doctorate) / female 25+ total
        try:
            num = sum(float(d[k]) for k in ("B15002_032E", "B15002_033E", "B15002_034E", "B15002_035E"))
            fem_bach = round(num / float(d["B15002_019E"]) * 100.0, 1)
        except (KeyError, ValueError, ZeroDivisionError):
            fem_bach = ""
        # flfp %: in labor force / females 16+
        try:
            flfp = round(float(p["DP03_0111E"]) / float(p["DP03_0110E"]) * 100.0, 1)
        except (KeyError, ValueError, ZeroDivisionError):
            flfp = ""
        tfr, tfr_year = TFR.get(usps, ("", ""))
        rows.append([
            usps, str(int(fips)), name, region, tfr, tfr_year,
            f(detail, fips, "B01003_001E"), p.get("DP02_0154PE", ""),
            f(detail, fips, "B19301_001E"), f(detail, fips, "B25077_001E"),
            fem_bach, flfp, URBAN.get(usps, ""), SOCIAL.get(usps, ""), RELIG.get(usps, ""),
        ])

    header = ["iso3", "iso_num", "name", "region", "tfr", "tfr_year", "population", "broadband",
              "income_pc", "home_value", "fem_bachelors", "flfp", "urbanisation", "social_capital", "religiosity"]
    with open(DATA / "us_states.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)
    print(f"us_states.csv: {len(rows)} rows")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Fill the identity + hand-populated tables**

Complete `STATES` (all 51), and populate `URBAN`, `SOCIAL`, `TFR` (and `RELIG` if the Pew table is clean) from the cited published sources. If a source can't be obtained cleanly, leave those cells blank (coverage will report the gap; the factor is still selectable and shows "insufficient data").

- [ ] **Step 3: Build the CSV**

Run: `cd data-pipeline && .venv/bin/python scripts/build_us_states.py`
Expected: `us_states.csv: 51 rows`. Open the CSV and sanity-check a few values (CA income ~$40k, UT high social capital, etc.).

- [ ] **Step 4: Fetch OSM state amenity counts + emit the bundle**

Run: `cd data-pipeline && .venv/bin/python -m fertility_pipeline.us_states --csv data/us_states.csv --out ../web/public/data/us --cache-dir out/raw/overpass_us`
Expected: `Wrote US bundle to ../web/public/data/us/ — 51 units, N with TFR.` (OSM runs ~51 state queries with 1s spacing; any state that times out is negative-cached and its amenity component is dropped — Possibility still computes from the other 3 components.)

- [ ] **Step 5: Sanity-check the emitted bundle**

Run: `cd data-pipeline && .venv/bin/python -c "import json; m=json.load(open('../web/public/data/us/meta.json')); print(m['countryCount'], m['withTfr']); print({k:v for k,v in m['coverage'].items()})"`
Expected: 51 units, most with TFR; `possibility` coverage high (≈ all states). Confirm `factors.json` `target.transform` is recorded (likely `raw` for the narrow state TFR range).

- [ ] **Step 6: Commit**

```bash
git add data-pipeline/scripts/build_us_states.py data-pipeline/data/us_states.csv web/public/data/us
git commit -m "data: US-states factor CSV + emitted bundle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Rename `Country` → `GeoUnit` (scale-neutral type)

**Files:**
- Modify: `web/src/types.ts`
- Test: existing web suite (no new test; the gate is the suite staying green).

**Interfaces:**
- Produces: `export interface GeoUnit { iso3; iso_num; name; region; tfr; tfr_year; factors }` and `export type Country = GeoUnit` (deprecated alias). Field names are unchanged, so no consumer needs editing. `iso3` is documented as "unit id (ISO3 for countries, USPS code for US states)"; `iso_num` as "numeric join id (ISO numeric / state FIPS)".

- [ ] **Step 1: Edit `types.ts`**

```ts
/**
 * A geographic unit at any scale.
 * `iso3`   — unit id: ISO alpha-3 for countries, USPS code (e.g. "CA") for US states.
 * `iso_num`— numeric join id matching the topojson feature id: ISO numeric / state FIPS.
 */
export interface GeoUnit {
  iso3: string;
  iso_num: number;
  name: string;
  region: string;
  tfr: number | null;
  tfr_year: number | null;
  factors: Record<string, number | null>;
}

/** @deprecated use GeoUnit — kept so existing imports keep compiling. */
export type Country = GeoUnit;
```

(Leave `Bundle`, `FactorMeta`, `TargetMeta`, `Direction` unchanged. `Bundle.countries: Country[]` still resolves via the alias.)

- [ ] **Step 2: Run the web suite + typecheck**

Run: `cd web && npm run test && npm run build`
Expected: All existing tests pass; `tsc -b` clean (the alias keeps `Country` imports valid).

- [ ] **Step 3: Commit**

```bash
git add web/src/types.ts
git commit -m "refactor(web): rename Country type to GeoUnit (scale-neutral) with alias

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Projection + object-name selection in the map layer

**Files:**
- Modify: `web/src/lib/geo.ts`
- Modify: `web/src/components/MapView.tsx`
- Test: `web/src/components/MapView.test.tsx` (add a states/albersUsa case)

**Interfaces:**
- Produces:
  - `featuresFromTopo(topo, objectName = "countries", excludeName?: string): GeoFeature[]` — uses `topo.objects[objectName]`; filters a feature by `properties.name === excludeName` only when `excludeName` is given.
  - `MapView` gains props `projectionKind?: "world" | "albersUsa"` (default `"world"`) and `objectName?: string` (default `"countries"`). `"world"` → `geoNaturalEarth1` + Antarctica excluded; `"albersUsa"` → `geoAlbersUsa`, no exclusion.

- [ ] **Step 1: Write the failing test** (append to `MapView.test.tsx`, following the file's existing render setup)

```tsx
it("renders US states with the albersUsa projection", () => {
  // minimal 1-feature states topojson (object key "states", id = FIPS string)
  const statesTopo = {
    type: "Topology",
    arcs: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    objects: { states: { type: "GeometryCollection", geometries: [
      { type: "Polygon", id: "06", arcs: [[0]], properties: { name: "California" } },
    ] } },
    transform: { scale: [1, 1], translate: [0, 0] },
  };
  const unit = { iso3: "CA", iso_num: 6, name: "California", region: "West", tfr: 1.5, tfr_year: 2022, factors: {} };
  const byIsoNum = new Map([[6, unit]]);
  const fit = { factorIds: [], transform: "raw", n: 0, r2: null, intercept: NaN, coefficients: {}, fits: new Map() };
  const { container } = render(
    <MapView topo={statesTopo} byIsoNum={byIsoNum as any} fit={fit as any} mode="raw"
      selectedIso3={null} onSelect={() => {}} dark={false} projectionKind="albersUsa" objectName="states" />,
  );
  expect(container.querySelectorAll("path").length).toBe(1);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/components/MapView.test.tsx`
Expected: FAIL — `objectName`/`projectionKind` not honored (reads `topo.objects.countries`, which is undefined → throw or 0 paths).

- [ ] **Step 3: Implement `geo.ts`**

```ts
export function featuresFromTopo(topo: any, objectName = "countries", excludeName?: string): GeoFeature[] {
  const fc = feature(topo, topo.objects[objectName]) as unknown as { features: GeoFeature[] };
  return excludeName ? fc.features.filter((f) => f.properties?.name !== excludeName) : fc.features;
}
```

(Keep `indexByIsoNum` as-is.)

- [ ] **Step 4: Implement `MapView.tsx`**

Add imports and props; select projection/object by kind:

```tsx
import { geoNaturalEarth1, geoAlbersUsa, geoPath } from "d3-geo";
// ...
export interface MapViewProps {
  topo: unknown;
  byIsoNum: Map<number, Country>;
  fit: FitResult;
  mode: "raw" | "residual";
  selectedIso3: string | null;
  onSelect: (iso3: string) => void;
  dark: boolean;
  projectionKind?: "world" | "albersUsa";
  objectName?: string;
}
// inside component:
const { topo, byIsoNum, fit, mode, selectedIso3, onSelect, dark,
        projectionKind = "world", objectName = "countries" } = props;
const features = useMemo(
  () => featuresFromTopo(topo, objectName, projectionKind === "world" ? "Antarctica" : undefined),
  [topo, objectName, projectionKind],
);
const path = useMemo(() => {
  const base = projectionKind === "albersUsa" ? geoAlbersUsa() : geoNaturalEarth1();
  const projection = base.fitSize([W, H], { type: "FeatureCollection", features } as any);
  return geoPath(projection);
}, [features, projectionKind]);
```

(The `<svg>` `aria-label` can stay generic or be derived; leave the render body otherwise unchanged.)

- [ ] **Step 5: Run the map tests + suite**

Run: `cd web && npm run test`
Expected: PASS — existing MapView/world tests (defaults unchanged) + the new albersUsa test.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/geo.ts web/src/components/MapView.tsx web/src/components/MapView.test.tsx
git commit -m "feat(web): MapView projection + topojson object selection (albersUsa for states)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Scale selector + per-scale bundle/topo/projection wiring in `App`

**Files:**
- Add asset: `web/public/data/us-states-10m.json` (us-atlas states topojson).
- Modify: `web/src/App.tsx`
- Test: `web/src/App.integration.test.tsx` (add a scale-switch case)

**Interfaces:**
- Consumes: `loadBundle("/data/us")`, `MapView` `projectionKind`/`objectName`, `GeoUnit`.
- Produces: App-level `scale: "world" | "us"` state; a `<nav aria-label="Scale">` selector; lazy-loaded, cached US bundle + US topo; per-scale default factor sets.

- [ ] **Step 1: Fetch the states topojson**

Run: `cd web && curl -sL https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json -o public/data/us-states-10m.json && node -e "const t=require('./public/data/us-states-10m.json'); console.log(Object.keys(t.objects), t.objects.states.geometries.length)"`
Expected: prints `[ 'states', 'nation' ] 5N` — object key `states`, ~51 geometries (states + DC; may include territories — the join simply ignores FIPS with no matching unit).

- [ ] **Step 2: Write the failing integration test** (append to `App.integration.test.tsx`, matching its existing fetch-mock pattern)

The existing test already mocks `fetch` for `/data/*`. Extend the mock so `/data/us/*` returns a small US bundle and `/data/us-states-10m.json` returns the 1-feature states topo (as in Task 7). Then:

```tsx
it("switches to the US scale and renders state units", async () => {
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
```

(Provide `California` + `Utah` in the mocked `/data/us/countries.json`, and `social_capital` in `/data/us/factors.json`.)

- [ ] **Step 3: Run to verify it fails**

Run: `cd web && npx vitest run src/App.integration.test.tsx`
Expected: FAIL — no "United States" button exists.

- [ ] **Step 4: Implement `App.tsx`**

Add scale state, defaults, lazy loading, the selector, and pass projection/object props. Key additions:

```tsx
const DEFAULT_FACTORS = ["gdp_pc", "fem_sec_enroll", "flfp", "child_mortality", "urbanisation"];
const DEFAULT_FACTORS_US = ["income_pc", "fem_bachelors", "flfp", "urbanisation", "social_capital"];

// state
const [scale, setScale] = useState<"world" | "us">("world");
const [usBundle, setUsBundle] = useState<Bundle | null>(null);
const [usTopo, setUsTopo] = useState<object | null>(null);

// lazy-load US assets on first switch
useEffect(() => {
  if (scale === "us" && !usBundle) loadBundle("/data/us").then(setUsBundle);
  if (scale === "us" && !usTopo) fetch("/data/us-states-10m.json").then((r) => r.json()).then(setUsTopo);
}, [scale, usBundle, usTopo]);

// active bundle/topo/projection
const activeBundle = scale === "us" ? usBundle : bundle;
const activeTopo = scale === "us" ? usTopo : topo;
const projectionKind = scale === "us" ? "albersUsa" : "world";
const objectName = scale === "us" ? "states" : "countries";
```

- On scale switch, reset `selected` to that scale's defaults and clear `selectedIso3`:

```tsx
const switchScale = (s: "world" | "us") => {
  setScale(s);
  setSelected(new Set(s === "us" ? DEFAULT_FACTORS_US : DEFAULT_FACTORS));
  setSelectedIso3(null);
};
```

- Render the scale selector above the view tabs:

```tsx
<nav aria-label="Scale" style={{ display: "flex", gap: 4, marginBottom: 8 }}>
  {(["world", "us"] as const).map((s) => (
    <button key={s} aria-pressed={scale === s} onClick={() => switchScale(s)}>
      {s === "world" ? "World" : "United States"}
    </button>
  ))}
</nav>
```

- Replace every use of `bundle`/`topo`/`byIsoNum`/`fit` in the render with the **active** scale's values. Concretely: compute `fit`, `byIsoNum`, `factorIds`, `selectedCountry` from `activeBundle`; guard `if (!activeBundle || !fit) return <div>Loading…</div>;`; pass `topo={activeTopo}`, `projectionKind`, `objectName` to `MapView`; pass `bundle={activeBundle}` to `ControlPanel`/`ScatterView`/`TableView`/`DetailPanel`/`AboutView`. (The `useMemo` deps change from `bundle`→`activeBundle`.)

> Because the US JSON reuses `iso3`/`iso_num`, `fitModel`, `computeScatterPoints`, `buildTableRows`, `indexByIsoNum`, `DetailPanel` all work unchanged on the active bundle.

- [ ] **Step 5: Run the integration test + full suite + build**

Run: `cd web && npm run test && npm run build`
Expected: PASS — new scale-switch test + all existing; `tsc -b` clean; build green.

- [ ] **Step 6: Commit**

```bash
git add web/src/App.tsx web/src/App.integration.test.tsx web/public/data/us-states-10m.json
git commit -m "feat(web): World/United States scale selector with per-scale model and map

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: About view — US-states methodology section

**Files:**
- Modify: `web/src/views/AboutView.tsx`
- Test: `web/src/views/AboutView.test.tsx` (add an assertion)

**Interfaces:**
- Consumes: nothing new (static copy). Produces: a new "Sub-national: United States" section.

- [ ] **Step 1: Write the failing test** (append to `AboutView.test.tsx`)

```tsx
it("documents the US-states sub-national layer", () => {
  render(<AboutView bundle={bundle as any} />);
  expect(screen.getByText(/sub-national/i)).toBeInTheDocument();
  expect(screen.getByText(/present-day/i)).toBeInTheDocument();
  expect(screen.getByText(/separate model/i)).toBeInTheDocument();
});
```

(Reuse whatever `bundle` fixture the existing AboutView tests already construct.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/views/AboutView.test.tsx`
Expected: FAIL — the new copy isn't present.

- [ ] **Step 3: Implement — add a section to `AboutView.tsx`**

Add, after the existing methodology content:

```tsx
<section>
  <h3>Sub-national: United States</h3>
  <p>
    Use the <strong>Scale</strong> selector to drill from the world into US states
    (50 states + DC). This is a <strong>present-day</strong> snapshot only; there is
    no historical sub-national view yet.
  </p>
  <p>
    Each scale is a <strong>separate model</strong>: the US map is fit only on US
    states with a state-specific factor set — per-capita income, median home value,
    women’s bachelor’s attainment, female labour-force participation, urbanisation,
    the Social Capital Project index, and a state Possibility index (per-capita
    cultural/social amenities from OpenStreetMap plus broadband access). Covariates
    are not comparable across scales, so the country and state models are never mixed.
  </p>
  <p>
    Sources: Census ACS (2022), CDC NCHS natality, the JEC Social Capital Project,
    OpenStreetMap, and (where available) the Pew Religious Landscape Study. Missing
    values are shown as “insufficient data,” never imputed.
  </p>
</section>
```

- [ ] **Step 4: Run the about tests + suite**

Run: `cd web && npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/views/AboutView.tsx web/src/views/AboutView.test.tsx
git commit -m "docs(web): About view — US-states sub-national methodology

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Final verification and merge

**Files:** none (verification + merge).

- [ ] **Step 1: Full pipeline suite**

Run: `cd data-pipeline && .venv/bin/pytest -q`
Expected: PASS (all, including the new US tests).

- [ ] **Step 2: Full web suite + production build**

Run: `cd web && npm run test && npm run build`
Expected: All vitest tests pass; `tsc -b` clean; Vite build succeeds.

- [ ] **Step 3: Manual smoke (optional if preview available)**

Run: `cd web && npm run dev`, open the app, click **United States**, confirm the map reprojects to states, factor toggles show the state set, residual/raw modes work, and clicking a state fills the detail panel; switch back to **World** and confirm it still works.

- [ ] **Step 4: Merge to main**

Follow `superpowers:finishing-a-development-branch` — fast-forward/merge the feature branch into `main`, re-run both suites on merged `main`, and delete the branch.

---

## Self-Review

**Spec coverage:**
- §2 scope (51 units, present-day, own model, scale selector) → Tasks 1,4,8. ✓
- §3 units/geometry (FIPS join, us-atlas topo, geoAlbersUsa) → Tasks 7,8; Global Constraints. ✓
- §4 factor set (income, home value, fem bachelors, flfp, urbanisation, social capital, religiosity, possibility) → Task 1. ✓
- §5 state Possibility (per-capita OSM amenities + broadband + urbanisation + income; ≥3 components) → Task 4 (`build_us_possibility`, reuses `compute_possibility` with MIN_COMPONENTS=3). ✓
- §6 pipeline (build_us_states.py, us_states run path, OSM state variant, committed CSV, transform choice, schema-validated emit) → Tasks 2,3,4,5. ✓
- §7 web (GeoUnit type, scale-path loading, scale selector, projection swap, per-scale factor lists, About) → Tasks 6,7,8,9. ✓
- §8 testing (ACS/FIPS/possibility/transform/schema; web scale switch/model/projection/detail) → Tasks 2,4,7,8. ✓
- §9 honesty rules (separate model, no imputation, present-day label, exp badge) → Global Constraints; Possibility badge already keyed on `group === "Possibility"` (unchanged from Plan 1C). ✓

**Placeholder scan:** The only intentionally-partial content is Task 5's hand-populated tables (`URBAN`, `SOCIAL`, `TFR`, `STATES`), which is a data-entry step with cited sources, not a code placeholder — Step 2 makes completing it explicit. All code steps contain full code.

**Type consistency:** `registry` interface (`TARGET`, `FACTORS`, `factor_ids`, `worldbank_factors`, `static_factors`, `computed_factors`) is provided by both `factors` and `factors_us` (Task 1) and consumed by `build_records`/`write_bundle` (Task 2). `load_us_states` returns `(refs, tfr, raw)` (Task 4) consumed consistently by `run_us_pipeline`. Web: `GeoUnit`/`Country` alias (Task 6) keeps all consumers valid; `MapView` props `projectionKind`/`objectName` (Task 7) are passed by `App` (Task 8) with matching literals (`"albersUsa"`/`"states"`, `"world"`/`"countries"`). `fits` remain keyed by `iso3` (USPS for states) throughout.
