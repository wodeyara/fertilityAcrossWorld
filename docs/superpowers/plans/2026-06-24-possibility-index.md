# Possibility Index (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the constructed "Possibility Index" — a present-day composite capturing the sense of opportunity / "things to do" — as a new factor in the data pipeline, so it flows into the existing bundle and the web app's factor toggles with no web-app changes.

**Architecture:** A computed factor. An offline Overpass fetcher counts social/leisure OpenStreetMap amenities per country (using `out count;` so only aggregate counts return, not the POIs themselves), cached to disk. A composite module z-scores four-to-five components — amenity density per capita, internet penetration, mobile penetration, population density, net migration — and averages the available z-scores per country (no silent imputation: a country with too few components gets `null`). The orchestrator wires OSM + World Bank inputs into the composite, passes it to the builder as a `computed` factor, and the existing emit/schema carry it through. Then the live bundle is regenerated.

**Tech Stack:** Python 3.11+, requests, pandas, numpy, scipy (already pinned). Overpass API for OSM counts.

## Global Constraints

- **No silent imputation.** A country's Possibility value is `null` unless at least `MIN_COMPONENTS` (default 3) of its components are present. Component z-scores are computed only over countries with that component present.
- **OSM counts use Overpass `out count;` only** — never download full POI sets. Per-country area query keyed on `["ISO3166-1:alpha2"="XX"]`. All Overpass results are **cached** to `data-pipeline/.cache/overpass/<ISO2>.json` (gitignored) so reruns don't re-hit the API; fetching is rate-limited (sequential, with a per-request timeout).
- **The index is a z-scored, equal-weight composite** of present-day components. Present-day only (consistent with the spec dropping 1982; only the "now" snapshot exists).
- **Possibility's `direction` is `negative`** (hypothesis: more possibility → lower fertility); `source` is `"computed"`; `group` is `"Possibility"`.
- **No web-app changes.** The factor appears via `factors.json`/`countries.json`; the app renders it automatically. (An "experimental" badge in the UI is deferred to Plan 1C.)
- The three sources (`worldbank`, `static`, `computed`) must remain disjoint by factor id (builder enforces this).
- All commands run from `data-pipeline/` using the existing venv: `cd data-pipeline && .venv/bin/python -m pytest …`. Do not create a venv or pip install.

---

## File Structure

```
data-pipeline/
  fertility_pipeline/
    factors.py        # MODIFY: +Possibility group, +possibility factor, +computed_factors()
    overpass.py       # CREATE: OSM amenity-count fetcher (Overpass out count) + cached batch
    possibility.py    # CREATE: compose the index from components (z-score + average)
    build.py          # MODIFY: merge a computed_data source
    run.py            # MODIFY: orchestrate OSM + WB components -> possibility -> build
  data/
    iso2.csv          # CREATE (committed): iso3 -> iso2 (for Overpass area filter)
  tests/
    fixtures/overpass_count.json   # CREATE
    fixtures/iso2_sample.csv       # CREATE
    test_factors.py   # MODIFY
    test_overpass.py  # CREATE
    test_possibility.py # CREATE
    test_build.py     # MODIFY
    test_run.py       # MODIFY
```

---

### Task 1: Registry — add the Possibility factor

**Files:**
- Modify: `data-pipeline/fertility_pipeline/factors.py`
- Test: `data-pipeline/tests/test_factors.py`

**Interfaces:**
- Produces: a `possibility` Factor (`group="Possibility"`, `source="computed"`, `code="possibility"`, `direction="negative"`, `unit="z-score index"`); `"Possibility"` added to `GROUPS`; `computed_factors() -> list[Factor]`.

- [ ] **Step 1: Add the failing test**

Append to `data-pipeline/tests/test_factors.py`:
```python
def test_possibility_factor_present_and_computed():
    by_id = {f.id: f for f in factors.FACTORS}
    assert "possibility" in by_id
    p = by_id["possibility"]
    assert p.source == "computed"
    assert p.group == "Possibility"
    assert p.direction == "negative"
    assert "Possibility" in factors.GROUPS


def test_computed_factors_helper():
    assert [f.id for f in factors.computed_factors()] == ["possibility"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd data-pipeline && .venv/bin/python -m pytest tests/test_factors.py -v`
Expected: FAIL (no `possibility`, no `computed_factors`).

- [ ] **Step 3: Implement**

In `data-pipeline/fertility_pipeline/factors.py`: add `"Possibility"` to the `GROUPS` list; append to `FACTORS`:
```python
    Factor(id="possibility", label="Possibility index", group="Possibility", source="computed",
           code="possibility", direction="negative", unit="z-score index"),
```
And add the helper near `worldbank_factors`/`static_factors`:
```python
def computed_factors() -> list[Factor]:
    return [f for f in FACTORS if f.source == "computed"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd data-pipeline && .venv/bin/python -m pytest tests/test_factors.py -v`
Expected: PASS (all prior tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add data-pipeline/fertility_pipeline/factors.py data-pipeline/tests/test_factors.py
git commit -m "feat(pipeline): register the computed Possibility Index factor"
```

---

### Task 2: Overpass amenity-count fetcher

**Files:**
- Create: `data-pipeline/fertility_pipeline/overpass.py`
- Create: `data-pipeline/tests/fixtures/overpass_count.json`
- Test: `data-pipeline/tests/test_overpass.py`

**Interfaces:**
- Produces:
  - `AMENITY_TAGS: list[str]` — the social/leisure amenity values counted.
  - `build_query(iso2: str) -> str` — the Overpass QL string (uses `out count;`).
  - `parse_count(payload: dict) -> int` — extract `tags.total` from a `count` element.
  - `fetch_amenity_count(iso2: str, session=None, url=OVERPASS_URL) -> int` — POST the query, return the total count.
  - `fetch_all_amenity_counts(iso2_by_iso3: dict[str,str], cache_dir, session=None, sleep=None) -> dict[str,int]` — per-iso3 cached counts (reads/writes `<cache_dir>/<ISO2>.json`; only hits the API on cache miss; `sleep` injectable for rate-limiting, default a real sleep).

- [ ] **Step 1: Create the fixture**

`data-pipeline/tests/fixtures/overpass_count.json` (Overpass `out count` shape):
```json
{
  "version": 0.6,
  "elements": [
    { "type": "count", "id": 0, "tags": { "nodes": "1200", "ways": "150", "relations": "0", "total": "1350" } }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`data-pipeline/tests/test_overpass.py`:
```python
import json
from pathlib import Path

from fertility_pipeline import overpass

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "overpass_count.json").read_text())


class FakeResp:
    def __init__(self, payload):
        self._p = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._p


class FakeSession:
    def __init__(self, payload):
        self._p = payload
        self.calls = []

    def post(self, url, data=None, timeout=None):
        self.calls.append((url, data))
        return FakeResp(self._p)


def test_query_uses_out_count_and_area_filter():
    q = overpass.build_query("US")
    assert "out count;" in q
    assert '["ISO3166-1:alpha2"="US"]' in q
    assert "amenity" in q


def test_parse_count_reads_total():
    assert overpass.parse_count(FIXTURE) == 1350


def test_fetch_amenity_count_posts_query():
    session = FakeSession(FIXTURE)
    n = overpass.fetch_amenity_count("US", session=session)
    assert n == 1350
    assert session.calls[0][1]["data"]  # query body posted


def test_fetch_all_uses_cache(tmp_path):
    session = FakeSession(FIXTURE)
    calls = {"n": 0}
    fake_sleep = lambda s: calls.__setitem__("n", calls["n"] + 1)
    refs = {"USA": "US", "FRA": "FR"}
    first = overpass.fetch_all_amenity_counts(refs, tmp_path, session=session, sleep=fake_sleep)
    assert first == {"USA": 1350, "FRA": 1350}
    assert len(session.calls) == 2  # one API call per country
    # second run hits cache only — no new API calls
    session.calls.clear()
    second = overpass.fetch_all_amenity_counts(refs, tmp_path, session=session, sleep=fake_sleep)
    assert second == {"USA": 1350, "FRA": 1350}
    assert len(session.calls) == 0
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd data-pipeline && .venv/bin/python -m pytest tests/test_overpass.py -v`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 4: Implement**

`data-pipeline/fertility_pipeline/overpass.py`:
```python
import json
import time
from pathlib import Path

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

AMENITY_TAGS = [
    "bar", "pub", "cafe", "restaurant", "fast_food",
    "cinema", "theatre", "nightclub", "arts_centre",
]


def build_query(iso2: str) -> str:
    regex = "^(" + "|".join(AMENITY_TAGS) + ")$"
    return (
        "[out:json][timeout:180];"
        f'area["ISO3166-1:alpha2"="{iso2}"]->.a;'
        f'(node["amenity"~"{regex}"](area.a);way["amenity"~"{regex}"](area.a););'
        "out count;"
    )


def parse_count(payload: dict) -> int:
    for el in payload.get("elements", []):
        if el.get("type") == "count":
            return int(el.get("tags", {}).get("total", 0))
    return 0


def fetch_amenity_count(iso2: str, session=None, url: str = OVERPASS_URL) -> int:
    if session is None:
        import requests
        session = requests
    resp = session.post(url, data={"data": build_query(iso2)}, timeout=200)
    resp.raise_for_status()
    return parse_count(resp.json())


def fetch_all_amenity_counts(iso2_by_iso3, cache_dir, session=None, sleep=None) -> dict[str, int]:
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    if sleep is None:
        sleep = lambda s: time.sleep(s)
    out: dict[str, int] = {}
    for iso3, iso2 in sorted(iso2_by_iso3.items()):
        cache_file = cache / f"{iso2}.json"
        if cache_file.exists():
            out[iso3] = int(json.loads(cache_file.read_text())["total"])
            continue
        count = fetch_amenity_count(iso2, session=session)
        cache_file.write_text(json.dumps({"iso2": iso2, "total": count}))
        out[iso3] = count
        sleep(1.0)  # be polite to the public Overpass instance
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd data-pipeline && .venv/bin/python -m pytest tests/test_overpass.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add data-pipeline/fertility_pipeline/overpass.py data-pipeline/tests/test_overpass.py \
        data-pipeline/tests/fixtures/overpass_count.json
git commit -m "feat(pipeline): Overpass amenity-count fetcher with disk cache"
```

---

### Task 3: Possibility composite

**Files:**
- Create: `data-pipeline/fertility_pipeline/possibility.py`
- Test: `data-pipeline/tests/test_possibility.py`

**Interfaces:**
- Produces:
  - `COMPONENTS: list[str]` = `["amenity_density", "internet", "mobile", "pop_density", "net_migration"]`.
  - `MIN_COMPONENTS: int` = 3.
  - `zscore(values: dict[str, float | None]) -> dict[str, float | None]` — z-score over present values (std==0 → 1; <2 present → all None).
  - `compute_possibility(components: dict[str, dict[str, float | None]]) -> dict[str, float | None]` — z-score each component dict, then per iso3 average the available z-scores; `None` if fewer than `MIN_COMPONENTS` present. All components contribute positively (higher → more possibility).

- [ ] **Step 1: Write the failing test**

`data-pipeline/tests/test_possibility.py`:
```python
import math

from fertility_pipeline import possibility


def test_zscore_centers_and_scales():
    z = possibility.zscore({"A": 1.0, "B": 3.0, "C": 5.0})
    assert abs(z["A"] + z["C"]) < 1e-9  # symmetric around mean
    assert z["B"] == 0.0


def test_zscore_all_none_when_too_few():
    z = possibility.zscore({"A": 1.0, "B": None})
    assert z == {"A": None, "B": None}


def test_compute_requires_min_components():
    # A has 3 components, B has only 1 -> B is None
    components = {
        "amenity_density": {"A": 10.0, "B": 1.0, "C": 5.0, "D": 8.0},
        "internet": {"A": 80.0, "B": None, "C": 50.0, "D": 70.0},
        "mobile": {"A": 120.0, "B": None, "C": 90.0, "D": 110.0},
        "pop_density": {"A": 300.0, "B": None, "C": 100.0, "D": 200.0},
        "net_migration": {"A": 5.0, "B": None, "C": -2.0, "D": 1.0},
    }
    out = possibility.compute_possibility(components)
    assert out["B"] is None          # only 1 component present
    assert out["A"] is not None
    assert out["A"] > out["C"]       # A is higher on every component than C


def test_compute_averages_available_zscores():
    components = {c: {"A": 1.0, "B": 2.0, "C": 3.0} for c in possibility.COMPONENTS}
    out = possibility.compute_possibility(components)
    # all components identical ordering => composite is the common z-score
    assert out["B"] == 0.0
    assert math.isclose(out["A"], -out["C"], abs_tol=1e-9)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd data-pipeline && .venv/bin/python -m pytest tests/test_possibility.py -v`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 3: Implement**

`data-pipeline/fertility_pipeline/possibility.py`:
```python
import numpy as np

COMPONENTS = ["amenity_density", "internet", "mobile", "pop_density", "net_migration"]
MIN_COMPONENTS = 3


def zscore(values: dict[str, float | None]) -> dict[str, float | None]:
    present = {k: v for k, v in values.items() if v is not None}
    if len(present) < 2:
        return {k: None for k in values}
    arr = np.array(list(present.values()), dtype=float)
    mean = float(arr.mean())
    std = float(arr.std())
    if std == 0:
        std = 1.0
    return {k: ((present[k] - mean) / std if k in present else None) for k in values}


def compute_possibility(components: dict[str, dict[str, float | None]]) -> dict[str, float | None]:
    iso3s: set[str] = set()
    for comp in components.values():
        iso3s.update(comp.keys())

    z_by_comp = {name: zscore(values) for name, values in components.items()}

    out: dict[str, float | None] = {}
    for iso3 in iso3s:
        zs = [z_by_comp[name].get(iso3) for name in components]
        present = [z for z in zs if z is not None]
        out[iso3] = float(sum(present) / len(present)) if len(present) >= MIN_COMPONENTS else None
    return out
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd data-pipeline && .venv/bin/python -m pytest tests/test_possibility.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add data-pipeline/fertility_pipeline/possibility.py data-pipeline/tests/test_possibility.py
git commit -m "feat(pipeline): Possibility Index composite (z-scored, min-components)"
```

---

### Task 4: Builder — merge a computed data source

**Files:**
- Modify: `data-pipeline/fertility_pipeline/build.py`
- Test: `data-pipeline/tests/test_build.py`

**Interfaces:**
- Consumes: `computed_factors()` (Task 1).
- Produces: `build_records(refs, tfr_result, wb_results, static_data, computed_data=None)` — `computed_data: dict[str, dict[str, float|None]]` keyed `iso3 -> {factor_id: value}`. Computed factors are merged like static (missing → `None`). The source-overlap guard now covers wb ∪ static ∪ computed (raises `ValueError` on any overlap).

- [ ] **Step 1: Update the test**

In `data-pipeline/tests/test_build.py`, add `computed_data` to the existing fixtures and a new test. Add near the other constants:
```python
COMPUTED = {"USA": {"possibility": 1.4}}  # NER absent -> None
```
Update the three existing `build.build_records(REFS, TFR, WB, STATIC)` calls to `build.build_records(REFS, TFR, WB, STATIC, COMPUTED)`. Then append:
```python
def test_computed_factor_merged_and_missing_is_none():
    records = build.build_records(REFS, TFR, WB, STATIC, COMPUTED)
    by = {r["iso3"]: r for r in records}
    assert by["USA"]["factors"]["possibility"] == 1.4
    assert by["NER"]["factors"]["possibility"] is None
```
(The `test_all_registry_factor_ids_present_in_each_record` test already asserts every `factor_ids()` key — including `possibility` — is present, so it now also guards the computed factor.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd data-pipeline && .venv/bin/python -m pytest tests/test_build.py -v`
Expected: FAIL (signature mismatch / `possibility` not handled).

- [ ] **Step 3: Implement**

In `data-pipeline/fertility_pipeline/build.py`, change `build_records` to accept and merge `computed_data`:
```python
def build_records(
    refs: dict[str, CountryRef],
    tfr_result: dict[str, tuple[float, int]],
    wb_results: dict[str, dict[str, tuple[float, int]]],
    static_data: dict[str, dict[str, float | None]],
    computed_data: dict[str, dict[str, float | None]] | None = None,
) -> list[dict]:
    computed_data = computed_data or {}
    all_ids = registry.factor_ids()
    wb_ids = [f.id for f in registry.worldbank_factors()]
    static_ids = [f.id for f in registry.static_factors()]
    computed_ids = [f.id for f in registry.computed_factors()]

    overlap = (set(wb_ids) & set(static_ids)) | (set(wb_ids) & set(computed_ids)) | (set(static_ids) & set(computed_ids))
    if overlap:
        raise ValueError(f"Factor ids assigned to multiple sources: {sorted(overlap)}")

    records: list[dict] = []
    for iso3, ref in sorted(refs.items()):
        tfr = tfr_result.get(iso3)
        factor_values: dict[str, float | None] = {fid: None for fid in all_ids}

        for fid in wb_ids:
            hit = wb_results.get(fid, {}).get(iso3)
            if hit is not None:
                factor_values[fid] = hit[0]

        country_static = static_data.get(iso3, {})
        for fid in static_ids:
            factor_values[fid] = country_static.get(fid)

        country_computed = computed_data.get(iso3, {})
        for fid in computed_ids:
            factor_values[fid] = country_computed.get(fid)

        records.append({
            "iso3": ref.iso3,
            "iso_num": ref.iso_num,
            "name": ref.name,
            "region": ref.region,
            "tfr": tfr[0] if tfr else None,
            "tfr_year": tfr[1] if tfr else None,
            "factors": factor_values,
        })
    return records
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd data-pipeline && .venv/bin/python -m pytest tests/test_build.py -v`
Expected: PASS (existing + new test).

- [ ] **Step 5: Commit**

```bash
git add data-pipeline/fertility_pipeline/build.py data-pipeline/tests/test_build.py
git commit -m "feat(pipeline): merge computed factors in the builder"
```

---

### Task 5: Orchestrator — wire OSM + WB components into the index

**Files:**
- Create: `data-pipeline/data/iso2.csv`, `data-pipeline/tests/fixtures/iso2_sample.csv`
- Modify: `data-pipeline/fertility_pipeline/run.py`
- Test: `data-pipeline/tests/test_run.py`

**Provenance note:** `iso2.csv` (`iso3,iso2`) is generated alongside `countries_ref.csv` — extend `scripts/build_reference_data.py` to also emit it from pycountry (`pycountry.countries.get(alpha_3=iso3).alpha_2`). Committed reference data.

**Interfaces:**
- Consumes: `overpass.fetch_all_amenity_counts` (Task 2), `possibility.compute_possibility` (Task 3), `worldbank.fetch_indicator`, `build.build_records` (Task 4).
- Produces:
  - `POSSIBILITY_WB_CODES` = `{"internet": "IT.NET.USER.ZS", "mobile": "IT.CEL.SETS.P2", "pop_density": "EN.POP.DNST", "net_migration": "SM.POP.NETM", "population": "SP.POP.TOTL"}`.
  - `load_iso2(path) -> dict[str,str]` (iso3 -> iso2).
  - `build_possibility(iso2_by_iso3, cache_dir, fetch=None, osm_fetch=None) -> dict[str, dict[str, float|None]]` — fetch amenity counts + WB component indicators + population, build the `components` dict (amenity_density = count / population × 1000), call `compute_possibility`, return `{iso3: {"possibility": value}}`. (`iso2_by_iso3` is the only id input — there is no separate `refs` param.)
  - `run_pipeline(...)` gains `iso2_path="data/iso2.csv"`, `cache_dir="out/raw/overpass"`, and `osm_fetch=None` params. It loads iso2 (filtered to `refs`), computes `computed_data` via `build_possibility(..., fetch=fetch, osm_fetch=osm_fetch)`, and passes it to `build_records`. **`osm_fetch` is injectable precisely so the existing offline tests stay offline** (they must pass a stub).

- [ ] **Step 1: Create fixtures**

`data-pipeline/tests/fixtures/iso2_sample.csv`:
```csv
iso3,iso2
USA,US
ISR,IL
NER,NE
```

- [ ] **Step 2: Update existing tests for offline safety, then write the failing test**

**First — keep the existing `run_pipeline` tests offline.** `run_pipeline` now computes the Possibility Index, which would otherwise hit Overpass + extra World Bank calls. In `data-pipeline/tests/test_run.py`, add this stub near the top:
```python
def osm_stub(iso2_by_iso3, cache_dir, session=None, sleep=None):
    return {iso3: 1000 for iso3 in iso2_by_iso3}
```
Then add `iso2_path=str(FIX / "iso2_sample.csv"), osm_fetch=osm_stub` to **every** existing `run.run_pipeline(...)` call in the file (the offline-bundle test, the transform-choice test, and the empty-static test). Their existing `fetch=fake_fetch` already returns generic values for unknown indicator codes, so the possibility WB codes resolve without network; the assertions (bundle validity, `withTfr`, transform) are unaffected.

**Then append the composite test:**
```python
def test_build_possibility_combines_osm_and_wb(tmp_path):
    iso2 = {"USA": "US", "ISR": "IL", "NER": "NE"}

    def osm_fetch(iso2_by_iso3, cache_dir, session=None, sleep=None):
        return {"USA": 50000, "ISR": 8000, "NER": 200}

    def fake_fetch(code, start, end, session=None):
        # population + 4 WB components; give all three countries values
        table = {
            "SP.POP.TOTL": {"USA": (331_000_000, 2022), "ISR": (9_000_000, 2022), "NER": (25_000_000, 2022)},
            "IT.NET.USER.ZS": {"USA": (92.0, 2022), "ISR": (90.0, 2022), "NER": (10.0, 2022)},
            "IT.CEL.SETS.P2": {"USA": (110.0, 2022), "ISR": (140.0, 2022), "NER": (60.0, 2022)},
            "EN.POP.DNST": {"USA": (36.0, 2022), "ISR": (400.0, 2022), "NER": (20.0, 2022)},
            "SM.POP.NETM": {"USA": (900_000, 2022), "ISR": (30_000, 2022), "NER": (-20_000, 2022)},
        }
        return table.get(code, {})

    computed = run.build_possibility(iso2, tmp_path, fetch=fake_fetch, osm_fetch=osm_fetch)
    # All three have >=3 components -> all non-null; USA (rich, connected) > NER
    assert computed["USA"]["possibility"] is not None
    assert computed["NER"]["possibility"] is not None
    assert computed["USA"]["possibility"] > computed["NER"]["possibility"]
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd data-pipeline && .venv/bin/python -m pytest tests/test_run.py -v`
Expected: FAIL (`build_possibility` not defined).

- [ ] **Step 4: Implement**

In `data-pipeline/fertility_pipeline/run.py` add imports and helpers:
```python
import csv

from . import overpass, possibility

POSSIBILITY_WB_CODES = {
    "internet": "IT.NET.USER.ZS",
    "mobile": "IT.CEL.SETS.P2",
    "pop_density": "EN.POP.DNST",
    "net_migration": "SM.POP.NETM",
    "population": "SP.POP.TOTL",
}


def load_iso2(path) -> dict[str, str]:
    out: dict[str, str] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        for row in csv.DictReader(fh):
            out[row["iso3"].strip().upper()] = row["iso2"].strip().upper()
    return out


def build_possibility(iso2_by_iso3, cache_dir, fetch=None, osm_fetch=None):
    if fetch is None:
        fetch = worldbank.fetch_indicator
    if osm_fetch is None:
        osm_fetch = overpass.fetch_all_amenity_counts

    counts = osm_fetch(iso2_by_iso3, cache_dir)
    wb = {name: fetch(code, 2015, 2024) for name, code in POSSIBILITY_WB_CODES.items()}

    def wb_val(name, iso3):
        hit = wb[name].get(iso3)
        return hit[0] if hit else None

    population = {iso3: wb_val("population", iso3) for iso3 in iso2_by_iso3}
    amenity_density = {}
    for iso3 in iso2_by_iso3:
        pop = population.get(iso3)
        cnt = counts.get(iso3)
        amenity_density[iso3] = (cnt / pop * 1000.0) if (pop and cnt is not None and pop > 0) else None

    components = {
        "amenity_density": amenity_density,
        "internet": {iso3: wb_val("internet", iso3) for iso3 in iso2_by_iso3},
        "mobile": {iso3: wb_val("mobile", iso3) for iso3 in iso2_by_iso3},
        "pop_density": {iso3: wb_val("pop_density", iso3) for iso3 in iso2_by_iso3},
        "net_migration": {iso3: wb_val("net_migration", iso3) for iso3 in iso2_by_iso3},
    }
    values = possibility.compute_possibility(components)
    return {iso3: {"possibility": values.get(iso3)} for iso3 in iso2_by_iso3}
```
Then extend `run_pipeline` to accept `iso2_path="data/iso2.csv"`, `cache_dir="out/raw/overpass"`, and `osm_fetch=None`. Inside, compute:
```python
    iso2_all = load_iso2(iso2_path)
    iso2_by_iso3 = {iso3: iso2 for iso3, iso2 in iso2_all.items() if iso3 in refs}
    computed_data = build_possibility(iso2_by_iso3, cache_dir, fetch=fetch, osm_fetch=osm_fetch)
```
and pass `computed_data` as the new 5th argument to `build.build_records(refs, tfr_result, wb_results, static_data, computed_data)`. Thread `osm_fetch` through from `run_pipeline`'s parameter (do **not** hard-code the real fetcher inside `run_pipeline`). Add matching `--iso2` and `--cache-dir` argparse options in `main` (defaults `data/iso2.csv` and `out/raw/overpass`).

- [ ] **Step 5: Run test + full suite**

Run: `cd data-pipeline && .venv/bin/python -m pytest tests/test_run.py -v`
Expected: PASS.
Run: `cd data-pipeline && .venv/bin/python -m pytest -v`
Expected: ALL pass, pristine.

- [ ] **Step 6: Extend the reference-data generator for iso2.csv**

In `data-pipeline/scripts/build_reference_data.py`, also write `data/iso2.csv` (`iso3,iso2`) using `pycountry.countries.get(alpha_3=iso3).alpha_2` for each country already collected. (Run it in Task 6.)

- [ ] **Step 7: Commit**

```bash
git add data-pipeline/fertility_pipeline/run.py data-pipeline/tests/test_run.py \
        data-pipeline/tests/fixtures/iso2_sample.csv data-pipeline/scripts/build_reference_data.py
git commit -m "feat(pipeline): orchestrate Possibility Index from OSM + World Bank inputs"
```

---

### Task 6: Regenerate the live bundle with the Possibility Index

**Files:**
- Modify (regenerated): `data-pipeline/out/{countries,factors,meta}.json`, `data-pipeline/data/iso2.csv`
- Modify (refresh app data): `web/public/data/{countries,factors,meta}.json`

**This task runs live network (Overpass + World Bank). The Overpass sweep is slow (~200 countries, rate-limited, cached) — run it once; reruns hit the cache.**

- [ ] **Step 1: Generate the iso2 reference**

Run: `cd data-pipeline && .venv/bin/python scripts/build_reference_data.py`
Expected: writes `data/countries_ref.csv` and `data/iso2.csv`.

- [ ] **Step 2: Run the full pipeline (live)**

Run: `cd data-pipeline && .venv/bin/python -m fertility_pipeline.run --out out`
Expected: prints country/TFR counts. The first run performs the cached Overpass sweep (be patient; large countries take longest). Inspect `out/meta.json` — `coverage.possibility` should be a healthy fraction of 215 (countries with ≥3 components). Investigate if it is surprisingly low.

- [ ] **Step 3: Sanity-check the index**

Run a quick check that the index is plausible (high-amenity, high-connectivity countries rank high; sparse ones low):
```bash
cd data-pipeline && .venv/bin/python - <<'PY'
import json
c = {x["iso3"]: x for x in json.load(open("out/countries.json"))}
for iso in ("USA","FRA","KOR","NER","ISR","DEU","TCD"):
    v = c.get(iso, {}).get("factors", {}).get("possibility")
    print(iso, round(v, 3) if v is not None else None)
PY
```

- [ ] **Step 4: Refresh the web app's copy of the bundle**

Run: `cd web && npm run copy-data`
Expected: copies the new bundle into `web/public/data/` (the `possibility` factor now appears).

- [ ] **Step 5: Verify the web suite still passes**

Run: `cd web && npm test`
Expected: all tests pass (the app is data-driven; the new factor needs no code change).

- [ ] **Step 6: Commit**

```bash
git add data-pipeline/data/iso2.csv data-pipeline/out/countries.json \
        data-pipeline/out/factors.json data-pipeline/out/meta.json \
        web/public/data/countries.json web/public/data/factors.json web/public/data/meta.json
git commit -m "data: regenerate bundle with the Possibility Index (live OSM + WB)"
```

---

## Self-Review

**1. Spec coverage (Possibility Index, §5.2):**
- OSM amenity density ("things to do") → Tasks 2, 5. ✅
- Urban agglomeration / density → `pop_density` component (Task 5). ✅
- Digital exposure (internet + mobile) → Task 5 WB codes. ✅
- Migration pull → `net_migration` component (Task 5). ✅
- z-scored, equal-weight composite → Task 3. ✅
- Experimental / present-day lens → present-day only (no historical fabrication); UI "experimental" badge deferred to 1C (noted). ✅
- Components inspectable: the composite is transparent (z-score + average of named components); per-component exposure in the UI is a 1C enhancement.

**2. Placeholder scan:** No TBD/TODO. `iso2.csv` and the live bundle are explicit data-generation steps (Task 5.6, Task 6), consistent with how Phase 1A treated reference data and the live run.

**3. Type/interface consistency:** `fetch_all_amenity_counts(iso2_by_iso3, cache_dir, session, sleep)` (Task 2) is called by `build_possibility` (Task 5) as `osm_fetch(iso2_by_iso3, cache_dir)`. `compute_possibility(components)` (Task 3) consumes the `components` dict built in Task 5 keyed by `COMPONENTS`. `build_records(..., computed_data)` (Task 4) is called by `run_pipeline` (Task 5). The `possibility` factor id (Task 1) is what Task 5 emits and Task 4 merges. Consistent.

## Out of scope (later)
- UI "experimental" badge + per-component breakdown panel for Possibility (Plan 1C).
- 2004 snapshot of Possibility (degraded: density + early internet) — Phase 3.
- Sub-national amenity density — Phase 4.
- Replacing net-migration with a youth-specific migration measure if a clean source is found.
