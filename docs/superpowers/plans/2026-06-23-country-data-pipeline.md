# Country Data Pipeline (Phase 1A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a validated, bundled JSON dataset of country-level total fertility rate and explanatory factors for the present snapshot, plus the data contract (JSON schema) the web app will consume.

**Architecture:** A small Python package fetches each factor from its source (World Bank API for most; committed static CSVs for UNDP/Gallup-derived factors), merges them into one tidy table keyed by ISO-3166 alpha-3 country code, decides the fertility transform empirically (raw vs. log) via residual diagnostics, and emits three JSON files (`countries.json`, `factors.json`, `meta.json`) validated against committed JSON schemas. Standardization is deliberately **not** done here — the app standardizes per factor selection; the pipeline emits raw values plus the chosen target transform.

**Tech Stack:** Python 3.11+, requests, pandas, numpy, scipy, jsonschema, pytest.

## Global Constraints

- **No silent imputation.** A missing factor value is emitted as JSON `null`, never guessed or interpolated.
- **Present snapshot = most recent non-null value since `START_YEAR` (default 2015) per country per factor**, with the source year recorded. Staleness is reported in `meta.json`, not hidden.
- **Pipeline emits raw factor values.** Standardization (z-scoring) happens in the web app, not here.
- **Target transform is chosen empirically** (raw TFR vs. `log(TFR)`) by comparing residual skew/normality; the choice is written to `factors.json` and never hard-coded.
- **Country scale only** in this plan. Region enum is the World Bank set: `East Asia & Pacific`, `Europe & Central Asia`, `Latin America & Caribbean`, `Middle East & North Africa`, `North America`, `South Asia`, `Sub-Saharan Africa`.
- **Python 3.11+**; dependencies pinned in `data-pipeline/requirements.txt`.
- All commands below are run from `data-pipeline/` unless stated otherwise.

---

## File Structure

```
data-pipeline/
  requirements.txt
  pytest.ini
  fertility_pipeline/
    __init__.py
    factors.py            # factor registry (target + factors)
    countries_ref.py      # ISO3 reference: numeric code, name, region
    worldbank.py          # World Bank API fetcher
    static_factors.py     # loader for committed UNDP/Gallup CSV
    build.py              # merge sources into tidy country records
    diagnostics.py        # choose raw vs log TFR transform
    emit.py               # write + validate JSON bundle
    run.py                # CLI orchestrator
  data/
    countries_ref.csv     # committed reference input (provenance documented)
    static_factors.csv    # committed UNDP/Gallup-derived factors
    schema/
      countries.schema.json
      factors.schema.json
  tests/
    fixtures/
      countries_ref_sample.csv
      static_factors_sample.csv
      worldbank_tfr.json
      worldbank_gdp.json
    test_factors.py
    test_countries_ref.py
    test_worldbank.py
    test_static_factors.py
    test_build.py
    test_diagnostics.py
    test_emit.py
    test_run.py
  out/                    # generated bundle (out/raw/ is gitignored)
```

---

### Task 1: Pipeline scaffolding + factor registry

**Files:**
- Create: `data-pipeline/requirements.txt`
- Create: `data-pipeline/pytest.ini`
- Create: `data-pipeline/fertility_pipeline/__init__.py`
- Create: `data-pipeline/fertility_pipeline/factors.py`
- Test: `data-pipeline/tests/test_factors.py`

**Interfaces:**
- Produces:
  - `TARGET: Factor` — the TFR target.
  - `FACTORS: list[Factor]` — the explanatory factors.
  - `Factor` dataclass: `id: str`, `label: str`, `group: str`, `source: str` (`"worldbank"` or `"static"`), `code: str`, `direction: str` (`"positive"`, `"negative"`, or `"mixed"`), `unit: str`.
  - `factor_ids() -> list[str]`, `worldbank_factors() -> list[Factor]`, `static_factors() -> list[Factor]`.
  - `GROUPS: list[str]` and `REGIONS: list[str]`.

- [ ] **Step 1: Create dependency and pytest config files**

`data-pipeline/requirements.txt`:
```
requests==2.32.3
pandas==2.2.2
numpy==1.26.4
scipy==1.13.1
jsonschema==4.22.0
pytest==8.2.2
```

`data-pipeline/pytest.ini`:
```ini
[pytest]
testpaths = tests
python_files = test_*.py
```

`data-pipeline/fertility_pipeline/__init__.py`:
```python
```
(empty file)

- [ ] **Step 2: Write the failing test**

`data-pipeline/tests/test_factors.py`:
```python
from fertility_pipeline import factors


def test_target_is_tfr():
    assert factors.TARGET.id == "tfr"
    assert factors.TARGET.source == "worldbank"
    assert factors.TARGET.code == "SP.DYN.TFRT.IN"


def test_factor_ids_are_unique():
    ids = factors.factor_ids()
    assert len(ids) == len(set(ids))
    assert "tfr" not in ids  # target is separate from explanatory factors


def test_every_factor_group_is_known():
    for f in factors.FACTORS:
        assert f.group in factors.GROUPS


def test_every_factor_has_a_source_code():
    for f in factors.FACTORS:
        assert f.source in {"worldbank", "static"}
        assert f.code, f"{f.id} missing code"


def test_expected_core_factors_present():
    ids = set(factors.factor_ids())
    assert {"gdp_pc", "urbanisation", "contraceptive", "flfp",
            "child_mortality", "adolescent_fertility", "fem_sec_enroll",
            "gini", "fem_years_schooling", "gii", "social_cohesion"} <= ids
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd data-pipeline && python -m pytest tests/test_factors.py -v`
Expected: FAIL with `ModuleNotFoundError` / `AttributeError` (factors module/attrs not defined).

- [ ] **Step 4: Write minimal implementation**

`data-pipeline/fertility_pipeline/factors.py`:
```python
from dataclasses import dataclass


@dataclass(frozen=True)
class Factor:
    id: str
    label: str
    group: str
    source: str   # "worldbank" or "static"
    code: str     # World Bank indicator code, or static CSV column name
    direction: str  # "positive" | "negative" | "mixed" (expected effect on fertility)
    unit: str


GROUPS = [
    "Economic",
    "Education",
    "Women's work & agency",
    "Health & access",
    "Structure",
    "Community",
]

REGIONS = [
    "East Asia & Pacific",
    "Europe & Central Asia",
    "Latin America & Caribbean",
    "Middle East & North Africa",
    "North America",
    "South Asia",
    "Sub-Saharan Africa",
]

TARGET = Factor(
    id="tfr",
    label="Total fertility rate",
    group="Target",
    source="worldbank",
    code="SP.DYN.TFRT.IN",
    direction="mixed",
    unit="births per woman",
)

FACTORS = [
    Factor("gdp_pc", "GDP per capita (PPP)", "Economic", "worldbank",
           "NY.GDP.PCAP.PP.KD", "negative", "constant int'l $"),
    Factor("gini", "Income inequality (Gini)", "Economic", "worldbank",
           "SI.POV.GINI", "mixed", "index 0-100"),
    Factor("fem_sec_enroll", "Female secondary enrolment", "Education", "worldbank",
           "SE.SEC.ENRR.FE", "negative", "% gross"),
    Factor("fem_years_schooling", "Female mean years of schooling", "Education", "static",
           "fem_years_schooling", "negative", "years"),
    Factor("flfp", "Female labour-force participation", "Women's work & agency", "worldbank",
           "SL.TLF.CACT.FE.ZS", "negative", "% of women 15+"),
    Factor("gii", "Gender Inequality Index", "Women's work & agency", "static",
           "gii", "positive", "index 0-1"),
    Factor("contraceptive", "Contraceptive prevalence", "Health & access", "worldbank",
           "SP.DYN.CONU.ZS", "negative", "% of women 15-49"),
    Factor("child_mortality", "Child mortality (under-5)", "Health & access", "worldbank",
           "SH.DYN.MORT", "positive", "per 1,000 live births"),
    Factor("adolescent_fertility", "Adolescent birth rate", "Health & access", "worldbank",
           "SP.ADO.TFRT", "positive", "births per 1,000 women 15-19"),
    Factor("urbanisation", "Urbanisation", "Structure", "worldbank",
           "SP.URB.TOTL.IN.ZS", "negative", "% urban"),
    Factor("social_cohesion", "Social cohesion / support", "Community", "static",
           "social_cohesion", "mixed", "index 0-100"),
]


def factor_ids() -> list[str]:
    return [f.id for f in FACTORS]


def worldbank_factors() -> list[Factor]:
    return [f for f in FACTORS if f.source == "worldbank"]


def static_factors() -> list[Factor]:
    return [f for f in FACTORS if f.source == "static"]
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd data-pipeline && python -m pytest tests/test_factors.py -v`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add data-pipeline/requirements.txt data-pipeline/pytest.ini \
        data-pipeline/fertility_pipeline/__init__.py \
        data-pipeline/fertility_pipeline/factors.py \
        data-pipeline/tests/test_factors.py
git commit -m "feat(pipeline): scaffold pipeline package and factor registry"
```

---

### Task 2: Country reference loader

**Files:**
- Create: `data-pipeline/data/countries_ref.csv` (committed reference input)
- Create: `data-pipeline/tests/fixtures/countries_ref_sample.csv`
- Create: `data-pipeline/fertility_pipeline/countries_ref.py`
- Test: `data-pipeline/tests/test_countries_ref.py`

**Provenance note (write at top of `countries_ref.csv` as a comment is not valid CSV — instead document here):** `countries_ref.csv` is curated from the ISO 3166-1 list (alpha-3 + numeric) joined to World Bank region assignments. Columns: `iso3,iso_num,name,region`. The numeric code (`iso_num`) is the join key for the web app's TopoJSON (world-atlas feature ids are ISO 3166-1 numeric). The committed file should contain all ~200 sovereign countries; the fixture below is a representative subset used by tests.

**Interfaces:**
- Produces:
  - `CountryRef` dataclass: `iso3: str`, `iso_num: int`, `name: str`, `region: str`.
  - `load_countries_ref(path: str | Path) -> dict[str, CountryRef]` keyed by `iso3`.

- [ ] **Step 1: Create the test fixture CSV**

`data-pipeline/tests/fixtures/countries_ref_sample.csv`:
```csv
iso3,iso_num,name,region
USA,840,United States,North America
ISR,376,Israel,Middle East & North Africa
KOR,410,South Korea,East Asia & Pacific
NER,562,Niger,Sub-Saharan Africa
FRA,250,France,Europe & Central Asia
```

- [ ] **Step 2: Write the failing test**

`data-pipeline/tests/test_countries_ref.py`:
```python
from pathlib import Path

from fertility_pipeline import countries_ref

FIXTURE = Path(__file__).parent / "fixtures" / "countries_ref_sample.csv"


def test_loads_keyed_by_iso3():
    refs = countries_ref.load_countries_ref(FIXTURE)
    assert set(refs) == {"USA", "ISR", "KOR", "NER", "FRA"}


def test_numeric_code_is_int():
    refs = countries_ref.load_countries_ref(FIXTURE)
    assert refs["USA"].iso_num == 840
    assert isinstance(refs["USA"].iso_num, int)


def test_region_and_name_populated():
    refs = countries_ref.load_countries_ref(FIXTURE)
    assert refs["ISR"].name == "Israel"
    assert refs["ISR"].region == "Middle East & North Africa"


def test_rejects_duplicate_iso3(tmp_path):
    bad = tmp_path / "dup.csv"
    bad.write_text("iso3,iso_num,name,region\n"
                   "USA,840,United States,North America\n"
                   "USA,841,Dup,North America\n")
    try:
        countries_ref.load_countries_ref(bad)
        assert False, "expected ValueError on duplicate iso3"
    except ValueError:
        pass
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd data-pipeline && python -m pytest tests/test_countries_ref.py -v`
Expected: FAIL (`ModuleNotFoundError: fertility_pipeline.countries_ref`).

- [ ] **Step 4: Write minimal implementation**

`data-pipeline/fertility_pipeline/countries_ref.py`:
```python
import csv
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class CountryRef:
    iso3: str
    iso_num: int
    name: str
    region: str


def load_countries_ref(path: str | Path) -> dict[str, CountryRef]:
    refs: dict[str, CountryRef] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            iso3 = row["iso3"].strip().upper()
            if iso3 in refs:
                raise ValueError(f"duplicate iso3 in reference: {iso3}")
            refs[iso3] = CountryRef(
                iso3=iso3,
                iso_num=int(row["iso_num"]),
                name=row["name"].strip(),
                region=row["region"].strip(),
            )
    return refs
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd data-pipeline && python -m pytest tests/test_countries_ref.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Populate the real reference file**

Create `data-pipeline/data/countries_ref.csv` with the same `iso3,iso_num,name,region` header and one row per sovereign country (~200), sourced from the ISO 3166-1 list joined to World Bank regions. At minimum it must include every country expected to have World Bank TFR data. This is curated reference data, not generated by the pipeline.

- [ ] **Step 7: Commit**

```bash
git add data-pipeline/data/countries_ref.csv \
        data-pipeline/tests/fixtures/countries_ref_sample.csv \
        data-pipeline/fertility_pipeline/countries_ref.py \
        data-pipeline/tests/test_countries_ref.py
git commit -m "feat(pipeline): add country reference loader and reference data"
```

---

### Task 3: World Bank fetcher

**Files:**
- Create: `data-pipeline/tests/fixtures/worldbank_tfr.json`
- Create: `data-pipeline/fertility_pipeline/worldbank.py`
- Test: `data-pipeline/tests/test_worldbank.py`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `fetch_indicator(code: str, start: int, end: int, session=None) -> dict[str, tuple[float, int]]` — maps `iso3 -> (value, year)`, taking the most recent non-null value in `[start, end]`. `session` is any object with a `.get(url, params=, timeout=)` returning an object with `.json()` and `.raise_for_status()` (defaults to `requests`).

- [ ] **Step 1: Create the fixture**

`data-pipeline/tests/fixtures/worldbank_tfr.json` (shape mirrors the real World Bank v2 JSON: a 2-element array `[meta, rows]`):
```json
[
  {"page": 1, "pages": 1, "per_page": 20000, "total": 4},
  [
    {"countryiso3code": "USA", "date": "2022", "value": 1.66},
    {"countryiso3code": "USA", "date": "2021", "value": 1.66},
    {"countryiso3code": "ISR", "date": "2022", "value": 2.89},
    {"countryiso3code": "NER", "date": "2021", "value": 6.82},
    {"countryiso3code": "NER", "date": "2022", "value": null}
  ]
]
```

- [ ] **Step 2: Write the failing test**

`data-pipeline/tests/test_worldbank.py`:
```python
import json
from pathlib import Path

from fertility_pipeline import worldbank

FIXTURE = Path(__file__).parent / "fixtures" / "worldbank_tfr.json"


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, payload):
        self._payload = payload
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        return FakeResponse(self._payload)


def _payload():
    return json.loads(FIXTURE.read_text())


def test_returns_value_and_year_per_country():
    session = FakeSession(_payload())
    result = worldbank.fetch_indicator("SP.DYN.TFRT.IN", 2015, 2024, session=session)
    assert result["ISR"] == (2.89, 2022)
    assert result["NER"] == (6.82, 2021)  # 2022 was null -> falls back to 2021


def test_takes_most_recent_nonnull():
    session = FakeSession(_payload())
    result = worldbank.fetch_indicator("SP.DYN.TFRT.IN", 2015, 2024, session=session)
    assert result["USA"] == (1.66, 2022)  # 2022 chosen over 2021


def test_builds_expected_url_and_params():
    session = FakeSession(_payload())
    worldbank.fetch_indicator("SP.DYN.TFRT.IN", 2015, 2024, session=session)
    url, params = session.calls[0]
    assert url.endswith("/country/all/indicator/SP.DYN.TFRT.IN")
    assert params["date"] == "2015:2024"
    assert params["format"] == "json"
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd data-pipeline && python -m pytest tests/test_worldbank.py -v`
Expected: FAIL (`ModuleNotFoundError: fertility_pipeline.worldbank`).

- [ ] **Step 4: Write minimal implementation**

`data-pipeline/fertility_pipeline/worldbank.py`:
```python
BASE_URL = "https://api.worldbank.org/v2"


def fetch_indicator(code: str, start: int, end: int, session=None) -> dict[str, tuple[float, int]]:
    if session is None:
        import requests
        session = requests
    url = f"{BASE_URL}/country/all/indicator/{code}"
    params = {
        "format": "json",
        "per_page": 20000,
        "date": f"{start}:{end}",
        "source": 2,
    }
    resp = session.get(url, params=params, timeout=60)
    resp.raise_for_status()
    payload = resp.json()
    rows = payload[1] if isinstance(payload, list) and len(payload) > 1 and payload[1] else []

    latest: dict[str, tuple[float, int]] = {}
    for row in rows:
        iso3 = (row.get("countryiso3code") or "").strip().upper()
        value = row.get("value")
        if not iso3 or value is None:
            continue
        year = int(row["date"])
        if iso3 not in latest or year > latest[iso3][1]:
            latest[iso3] = (float(value), year)
    return latest
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd data-pipeline && python -m pytest tests/test_worldbank.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add data-pipeline/fertility_pipeline/worldbank.py \
        data-pipeline/tests/test_worldbank.py \
        data-pipeline/tests/fixtures/worldbank_tfr.json
git commit -m "feat(pipeline): add World Bank indicator fetcher"
```

---

### Task 4: Static factors loader

**Files:**
- Create: `data-pipeline/tests/fixtures/static_factors_sample.csv`
- Create: `data-pipeline/data/static_factors.csv` (committed; provenance documented)
- Create: `data-pipeline/fertility_pipeline/static_factors.py`
- Test: `data-pipeline/tests/test_static_factors.py`

**Provenance note:** `static_factors.csv` carries factors that have no clean public API: `fem_years_schooling` and `gii` from the UNDP Human Development Report data files, and `social_cohesion` from the Gallup World Poll "social support" measure (or World Values Survey as fallback). Columns: `iso3,fem_years_schooling,gii,social_cohesion`. Empty cells mean missing and are loaded as `None`.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `load_static_factors(path: str | Path, columns: list[str]) -> dict[str, dict[str, float | None]]` — maps `iso3 -> {column: value or None}` for each column in `columns`.

- [ ] **Step 1: Create the fixture**

`data-pipeline/tests/fixtures/static_factors_sample.csv`:
```csv
iso3,fem_years_schooling,gii,social_cohesion
USA,13.4,0.179,90
ISR,13.1,0.083,87
KOR,12.4,0.067,80
NER,1.4,0.611,
FRA,11.6,0.083,88
```

- [ ] **Step 2: Write the failing test**

`data-pipeline/tests/test_static_factors.py`:
```python
from pathlib import Path

from fertility_pipeline import static_factors

FIXTURE = Path(__file__).parent / "fixtures" / "static_factors_sample.csv"
COLS = ["fem_years_schooling", "gii", "social_cohesion"]


def test_loads_values_keyed_by_iso3():
    data = static_factors.load_static_factors(FIXTURE, COLS)
    assert data["USA"]["fem_years_schooling"] == 13.4
    assert data["KOR"]["gii"] == 0.067


def test_empty_cell_is_none():
    data = static_factors.load_static_factors(FIXTURE, COLS)
    assert data["NER"]["social_cohesion"] is None


def test_only_requested_columns_returned():
    data = static_factors.load_static_factors(FIXTURE, ["gii"])
    assert set(data["FRA"]) == {"gii"}
    assert data["FRA"]["gii"] == 0.083
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd data-pipeline && python -m pytest tests/test_static_factors.py -v`
Expected: FAIL (`ModuleNotFoundError`).

- [ ] **Step 4: Write minimal implementation**

`data-pipeline/fertility_pipeline/static_factors.py`:
```python
import csv
from pathlib import Path


def load_static_factors(path: str | Path, columns: list[str]) -> dict[str, dict[str, float | None]]:
    out: dict[str, dict[str, float | None]] = {}
    with open(path, newline="", encoding="utf-8") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            iso3 = row["iso3"].strip().upper()
            values: dict[str, float | None] = {}
            for col in columns:
                raw = (row.get(col) or "").strip()
                values[col] = float(raw) if raw else None
            out[iso3] = values
    return out
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd data-pipeline && python -m pytest tests/test_static_factors.py -v`
Expected: PASS (3 tests).

- [ ] **Step 6: Populate the real static file**

Create `data-pipeline/data/static_factors.csv` with header `iso3,fem_years_schooling,gii,social_cohesion` and one row per country from the cited UNDP/Gallup sources. Missing values stay empty.

- [ ] **Step 7: Commit**

```bash
git add data-pipeline/fertility_pipeline/static_factors.py \
        data-pipeline/tests/test_static_factors.py \
        data-pipeline/tests/fixtures/static_factors_sample.csv \
        data-pipeline/data/static_factors.csv
git commit -m "feat(pipeline): add static factor loader and source data"
```

---

### Task 5: Builder — merge sources into country records

**Files:**
- Create: `data-pipeline/fertility_pipeline/build.py`
- Test: `data-pipeline/tests/test_build.py`

**Interfaces:**
- Consumes: `CountryRef` (Task 2); factor registry (Task 1); fetch results shaped like Task 3 output (`dict[str, tuple[float, int]]`) and Task 4 output (`dict[str, dict[str, float|None]]`).
- Produces:
  - `CountryRecord` TypedDict-shaped `dict`: `{"iso3": str, "iso_num": int, "name": str, "region": str, "tfr": float | None, "tfr_year": int | None, "factors": dict[str, float | None]}`.
  - `build_records(refs, tfr_result, wb_results, static_data) -> list[dict]` where `wb_results: dict[str, dict[str, tuple[float,int]]]` is keyed `factor_id -> {iso3 -> (value, year)}`, and `static_data: dict[str, dict[str, float|None]]` is keyed `iso3 -> {factor_id -> value}`. Only countries present in `refs` are emitted; a country with no TFR value gets `tfr=None`. Missing factors are `None`.

- [ ] **Step 1: Write the failing test**

`data-pipeline/tests/test_build.py`:
```python
from fertility_pipeline import build
from fertility_pipeline.countries_ref import CountryRef

REFS = {
    "USA": CountryRef("USA", 840, "United States", "North America"),
    "NER": CountryRef("NER", 562, "Niger", "Sub-Saharan Africa"),
}
TFR = {"USA": (1.66, 2022), "NER": (6.82, 2021)}
WB = {
    "gdp_pc": {"USA": (63000.0, 2022), "NER": (1200.0, 2022)},
    "urbanisation": {"USA": (82.7, 2022)},  # NER missing on purpose
}
STATIC = {
    "USA": {"gii": 0.179, "social_cohesion": 90.0},
    "NER": {"gii": 0.611, "social_cohesion": None},
}


def test_record_shape_and_join():
    records = build.build_records(REFS, TFR, WB, STATIC)
    by_iso = {r["iso3"]: r for r in records}
    usa = by_iso["USA"]
    assert usa["name"] == "United States"
    assert usa["iso_num"] == 840
    assert usa["tfr"] == 1.66
    assert usa["tfr_year"] == 2022
    assert usa["factors"]["gdp_pc"] == 63000.0
    assert usa["factors"]["social_cohesion"] == 90.0


def test_missing_factor_is_none():
    records = build.build_records(REFS, TFR, WB, STATIC)
    ner = next(r for r in records if r["iso3"] == "NER")
    assert ner["factors"]["urbanisation"] is None      # absent from WB result
    assert ner["factors"]["social_cohesion"] is None   # explicit None in static


def test_only_reference_countries_emitted():
    wb_extra = {"gdp_pc": {"USA": (63000.0, 2022), "XXX": (1.0, 2022)}}
    records = build.build_records(REFS, TFR, wb_extra, STATIC)
    assert {r["iso3"] for r in records} == {"USA", "NER"}


def test_all_registry_factor_ids_present_in_each_record():
    from fertility_pipeline import factors
    records = build.build_records(REFS, TFR, WB, STATIC)
    for r in records:
        assert set(r["factors"]) == set(factors.factor_ids())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd data-pipeline && python -m pytest tests/test_build.py -v`
Expected: FAIL (`ModuleNotFoundError: fertility_pipeline.build`).

- [ ] **Step 3: Write minimal implementation**

`data-pipeline/fertility_pipeline/build.py`:
```python
from . import factors as registry


def build_records(refs, tfr_result, wb_results, static_data) -> list[dict]:
    all_ids = registry.factor_ids()
    wb_ids = [f.id for f in registry.worldbank_factors()]
    static_ids = [f.id for f in registry.static_factors()]

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

Run: `cd data-pipeline && python -m pytest tests/test_build.py -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add data-pipeline/fertility_pipeline/build.py data-pipeline/tests/test_build.py
git commit -m "feat(pipeline): merge sources into tidy country records"
```

---

### Task 6: Transform diagnostics — choose raw vs log TFR

**Files:**
- Create: `data-pipeline/fertility_pipeline/diagnostics.py`
- Test: `data-pipeline/tests/test_diagnostics.py`

**Interfaces:**
- Consumes: country records (Task 5); factor registry (Task 1).
- Produces:
  - `choose_tfr_transform(records: list[dict], factor_ids: list[str]) -> tuple[str, dict]` — returns `("raw" | "log", details)`. It builds a design matrix from records that have a non-null `tfr` and non-null values for every factor in `factor_ids`, standardizes the factor columns, fits OLS for raw `tfr` and `log(tfr)`, and picks the transform whose residuals have the smaller absolute skewness. `details` maps each transform to `{"resid_skew": float, "normality_p": float, "n": int}`.

- [ ] **Step 1: Write the failing test**

`data-pipeline/tests/test_diagnostics.py`:
```python
import math
import numpy as np

from fertility_pipeline import diagnostics


def _record(iso, tfr, x):
    return {"iso3": iso, "tfr": tfr, "factors": {"x": x}}


def test_log_chosen_for_multiplicative_data():
    # Construct tfr = exp(a + b*x + noise): log-linear, so log transform fits best.
    rng = np.random.default_rng(0)
    records = []
    for i in range(120):
        x = rng.normal()
        tfr = math.exp(0.6 + 0.4 * x + rng.normal(0, 0.05))
        records.append(_record(f"C{i}", tfr, x))
    choice, details = diagnostics.choose_tfr_transform(records, ["x"])
    assert choice == "log"
    assert details["log"]["n"] == 120
    assert abs(details["log"]["resid_skew"]) <= abs(details["raw"]["resid_skew"])


def test_drops_rows_with_missing_values():
    records = [
        {"iso3": "A", "tfr": 2.0, "factors": {"x": 1.0}},
        {"iso3": "B", "tfr": None, "factors": {"x": 1.0}},
        {"iso3": "C", "tfr": 3.0, "factors": {"x": None}},
        {"iso3": "D", "tfr": 4.0, "factors": {"x": 2.0}},
    ]
    _choice, details = diagnostics.choose_tfr_transform(records, ["x"])
    assert details["raw"]["n"] == 2  # only A and D are complete
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd data-pipeline && python -m pytest tests/test_diagnostics.py -v`
Expected: FAIL (`ModuleNotFoundError: fertility_pipeline.diagnostics`).

- [ ] **Step 3: Write minimal implementation**

`data-pipeline/fertility_pipeline/diagnostics.py`:
```python
import numpy as np
from scipy import stats


def _design(records, factor_ids):
    ys, rows = [], []
    for r in records:
        tfr = r.get("tfr")
        if tfr is None or tfr <= 0:
            continue
        vals = [r["factors"].get(fid) for fid in factor_ids]
        if any(v is None for v in vals):
            continue
        ys.append(tfr)
        rows.append(vals)
    y = np.asarray(ys, dtype=float)
    X = np.asarray(rows, dtype=float)
    return y, X


def _standardize(X):
    mean = X.mean(axis=0)
    std = X.std(axis=0)
    std[std == 0] = 1.0
    return (X - mean) / std


def _fit_residuals(y, Xz):
    design = np.column_stack([np.ones(len(y)), Xz])
    beta, *_ = np.linalg.lstsq(design, y, rcond=None)
    return y - design @ beta


def choose_tfr_transform(records, factor_ids):
    y, X = _design(records, factor_ids)
    Xz = _standardize(X)
    details = {}
    for name, target in (("raw", y), ("log", np.log(y))):
        resid = _fit_residuals(target, Xz)
        if len(resid) >= 3:
            normality_p = float(stats.normaltest(resid).pvalue)
        else:
            normality_p = float("nan")
        details[name] = {
            "resid_skew": float(stats.skew(resid)),
            "normality_p": normality_p,
            "n": int(len(resid)),
        }
    choice = min(details, key=lambda k: abs(details[k]["resid_skew"]))
    return choice, details
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd data-pipeline && python -m pytest tests/test_diagnostics.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add data-pipeline/fertility_pipeline/diagnostics.py data-pipeline/tests/test_diagnostics.py
git commit -m "feat(pipeline): choose TFR transform via residual diagnostics"
```

---

### Task 7: Emit + validate the JSON bundle

**Files:**
- Create: `data-pipeline/data/schema/factors.schema.json`
- Create: `data-pipeline/data/schema/countries.schema.json`
- Create: `data-pipeline/fertility_pipeline/emit.py`
- Test: `data-pipeline/tests/test_emit.py`

**Interfaces:**
- Consumes: country records (Task 5); factor registry (Task 1); transform choice (Task 6).
- Produces:
  - `write_bundle(records, transform_choice, snapshot_year, out_dir) -> dict` — writes `factors.json`, `countries.json`, `meta.json` into `out_dir`, validates `countries.json` and `factors.json` against the committed schemas, and returns the `meta` dict.
  - `meta.json` shape: `{"snapshotYear": int, "countryCount": int, "withTfr": int, "coverage": {factor_id: int}}` where `coverage` counts non-null values.
  - `factors.json` shape: `{"snapshotYear": int, "target": {"id","label","transform","unit","source"}, "factors": [{"id","label","group","unit","direction","source"}]}`.
  - `countries.json` shape: `[{"iso3","iso_num","name","region","tfr","tfr_year","factors":{...}}]`.

- [ ] **Step 1: Create the JSON schemas**

`data-pipeline/data/schema/factors.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["snapshotYear", "target", "factors"],
  "properties": {
    "snapshotYear": {"type": "integer"},
    "target": {
      "type": "object",
      "required": ["id", "label", "transform", "unit", "source"],
      "properties": {
        "id": {"type": "string"},
        "label": {"type": "string"},
        "transform": {"enum": ["raw", "log"]},
        "unit": {"type": "string"},
        "source": {"type": "string"}
      }
    },
    "factors": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "label", "group", "unit", "direction", "source"],
        "properties": {
          "id": {"type": "string"},
          "label": {"type": "string"},
          "group": {"type": "string"},
          "unit": {"type": "string"},
          "direction": {"enum": ["positive", "negative", "mixed"]},
          "source": {"type": "string"}
        }
      }
    }
  }
}
```

`data-pipeline/data/schema/countries.schema.json`:
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["iso3", "iso_num", "name", "region", "tfr", "tfr_year", "factors"],
    "properties": {
      "iso3": {"type": "string", "minLength": 3, "maxLength": 3},
      "iso_num": {"type": "integer"},
      "name": {"type": "string"},
      "region": {"type": "string"},
      "tfr": {"type": ["number", "null"]},
      "tfr_year": {"type": ["integer", "null"]},
      "factors": {
        "type": "object",
        "additionalProperties": {"type": ["number", "null"]}
      }
    }
  }
}
```

- [ ] **Step 2: Write the failing test**

`data-pipeline/tests/test_emit.py`:
```python
import json
from pathlib import Path

from fertility_pipeline import emit


RECORDS = [
    {"iso3": "USA", "iso_num": 840, "name": "United States", "region": "North America",
     "tfr": 1.66, "tfr_year": 2022,
     "factors": {fid: 1.0 for fid in __import__("fertility_pipeline.factors", fromlist=["factor_ids"]).factor_ids()}},
    {"iso3": "NER", "iso_num": 562, "name": "Niger", "region": "Sub-Saharan Africa",
     "tfr": None, "tfr_year": None,
     "factors": {fid: None for fid in __import__("fertility_pipeline.factors", fromlist=["factor_ids"]).factor_ids()}},
]


def test_writes_three_files(tmp_path):
    emit.write_bundle(RECORDS, "log", 2023, tmp_path)
    for name in ("factors.json", "countries.json", "meta.json"):
        assert (tmp_path / name).exists()


def test_meta_counts(tmp_path):
    meta = emit.write_bundle(RECORDS, "log", 2023, tmp_path)
    assert meta["countryCount"] == 2
    assert meta["withTfr"] == 1
    assert meta["coverage"]["gdp_pc"] == 1  # only USA non-null


def test_factors_json_records_transform(tmp_path):
    emit.write_bundle(RECORDS, "log", 2023, tmp_path)
    data = json.loads((tmp_path / "factors.json").read_text())
    assert data["target"]["transform"] == "log"
    assert data["snapshotYear"] == 2023
    assert {f["id"] for f in data["factors"]} >= {"gdp_pc", "social_cohesion"}


def test_invalid_record_fails_schema_validation(tmp_path):
    import jsonschema
    import pytest
    bad = [{"iso3": "USAA", "iso_num": 840, "name": "X", "region": "North America",
            "tfr": 1.0, "tfr_year": 2022, "factors": {}}]  # iso3 too long
    with pytest.raises(jsonschema.ValidationError):
        emit.write_bundle(bad, "raw", 2023, tmp_path)
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd data-pipeline && python -m pytest tests/test_emit.py -v`
Expected: FAIL (`ModuleNotFoundError: fertility_pipeline.emit`).

- [ ] **Step 4: Write minimal implementation**

`data-pipeline/fertility_pipeline/emit.py`:
```python
import json
from pathlib import Path

import jsonschema

from . import factors as registry

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "data" / "schema"


def _build_factors_json(snapshot_year: int, transform_choice: str) -> dict:
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
            {
                "id": f.id,
                "label": f.label,
                "group": f.group,
                "unit": f.unit,
                "direction": f.direction,
                "source": f.source,
            }
            for f in registry.FACTORS
        ],
    }


def _build_meta(records: list[dict], snapshot_year: int) -> dict:
    coverage = {fid: 0 for fid in registry.factor_ids()}
    with_tfr = 0
    for r in records:
        if r["tfr"] is not None:
            with_tfr += 1
        for fid, val in r["factors"].items():
            if val is not None:
                coverage[fid] += 1
    return {
        "snapshotYear": snapshot_year,
        "countryCount": len(records),
        "withTfr": with_tfr,
        "coverage": coverage,
    }


def _validate(instance, schema_name: str) -> None:
    schema = json.loads((SCHEMA_DIR / schema_name).read_text())
    jsonschema.validate(instance=instance, schema=schema)


def write_bundle(records: list[dict], transform_choice: str, snapshot_year: int, out_dir) -> dict:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    factors_json = _build_factors_json(snapshot_year, transform_choice)
    meta = _build_meta(records, snapshot_year)

    _validate(records, "countries.schema.json")
    _validate(factors_json, "factors.schema.json")

    (out / "factors.json").write_text(json.dumps(factors_json, indent=2))
    (out / "countries.json").write_text(json.dumps(records, indent=2))
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd data-pipeline && python -m pytest tests/test_emit.py -v`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add data-pipeline/data/schema/factors.schema.json \
        data-pipeline/data/schema/countries.schema.json \
        data-pipeline/fertility_pipeline/emit.py \
        data-pipeline/tests/test_emit.py
git commit -m "feat(pipeline): emit and schema-validate the JSON bundle"
```

---

### Task 8: CLI orchestrator + offline integration test

**Files:**
- Create: `data-pipeline/fertility_pipeline/run.py`
- Test: `data-pipeline/tests/test_run.py`

**Interfaces:**
- Consumes: all earlier modules.
- Produces:
  - `run_pipeline(refs_path, static_path, out_dir, start, end, snapshot_year, fetch=None) -> dict` — orchestrates: load refs → load static → fetch each World Bank factor (and TFR) via `fetch` (defaults to `worldbank.fetch_indicator`, dependency-injected for tests) → build records → choose transform → emit. Returns `meta`.
  - `main(argv=None)` — argparse CLI exposing `--refs`, `--static`, `--out`, `--start`, `--end`, `--snapshot-year`.

- [ ] **Step 1: Write the failing test**

`data-pipeline/tests/test_run.py`:
```python
import json
from pathlib import Path

from fertility_pipeline import run, factors

FIX = Path(__file__).parent / "fixtures"


def fake_fetch(code, start, end, session=None):
    # Return deterministic (value, year) per country for any indicator code.
    table = {
        "SP.DYN.TFRT.IN": {"USA": (1.66, 2022), "ISR": (2.89, 2022), "NER": (6.82, 2021)},
    }
    if code in table:
        return table[code]
    # generic factor: give USA and ISR a value, NER missing
    return {"USA": (50.0, 2022), "ISR": (40.0, 2022)}


def test_run_pipeline_offline_produces_valid_bundle(tmp_path):
    meta = run.run_pipeline(
        refs_path=FIX / "countries_ref_sample.csv",
        static_path=FIX / "static_factors_sample.csv",
        out_dir=tmp_path,
        start=2015, end=2024, snapshot_year=2023,
        fetch=fake_fetch,
    )
    countries = json.loads((tmp_path / "countries.json").read_text())
    by = {c["iso3"]: c for c in countries}
    assert by["USA"]["tfr"] == 1.66
    assert by["NER"]["factors"]["gdp_pc"] is None  # fake_fetch omitted NER
    assert by["USA"]["factors"]["gii"] == 0.083 or by["USA"]["factors"]["gii"] == 0.179
    assert meta["withTfr"] == 3
    assert (tmp_path / "factors.json").exists()


def test_transform_choice_is_written(tmp_path):
    run.run_pipeline(
        refs_path=FIX / "countries_ref_sample.csv",
        static_path=FIX / "static_factors_sample.csv",
        out_dir=tmp_path, start=2015, end=2024, snapshot_year=2023,
        fetch=fake_fetch,
    )
    fj = json.loads((tmp_path / "factors.json").read_text())
    assert fj["target"]["transform"] in {"raw", "log"}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd data-pipeline && python -m pytest tests/test_run.py -v`
Expected: FAIL (`ModuleNotFoundError: fertility_pipeline.run`).

- [ ] **Step 3: Write minimal implementation**

`data-pipeline/fertility_pipeline/run.py`:
```python
import argparse

from . import factors as registry
from . import worldbank, countries_ref, static_factors, build, diagnostics, emit


def run_pipeline(refs_path, static_path, out_dir, start, end, snapshot_year, fetch=None) -> dict:
    if fetch is None:
        fetch = worldbank.fetch_indicator

    refs = countries_ref.load_countries_ref(refs_path)
    static_ids = [f.code for f in registry.static_factors()]
    static_data = static_factors.load_static_factors(static_path, static_ids)

    tfr_result = fetch(registry.TARGET.code, start, end)
    wb_results: dict[str, dict] = {}
    for f in registry.worldbank_factors():
        wb_results[f.id] = fetch(f.code, start, end)

    records = build.build_records(refs, tfr_result, wb_results, static_data)
    choice, _details = diagnostics.choose_tfr_transform(records, registry.factor_ids())
    return emit.write_bundle(records, choice, snapshot_year, out_dir)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build the country fertility data bundle.")
    parser.add_argument("--refs", default="data/countries_ref.csv")
    parser.add_argument("--static", default="data/static_factors.csv")
    parser.add_argument("--out", default="out")
    parser.add_argument("--start", type=int, default=2015)
    parser.add_argument("--end", type=int, default=2024)
    parser.add_argument("--snapshot-year", type=int, default=2023)
    args = parser.parse_args(argv)

    meta = run_pipeline(args.refs, args.static, args.out,
                        args.start, args.end, args.snapshot_year)
    print(f"Wrote bundle to {args.out}/ — {meta['countryCount']} countries, "
          f"{meta['withTfr']} with TFR.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd data-pipeline && python -m pytest tests/test_run.py -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full test suite**

Run: `cd data-pipeline && python -m pytest -v`
Expected: PASS (all tests across all modules).

- [ ] **Step 6: Generate the real bundle (live network)**

Run: `cd data-pipeline && python -m fertility_pipeline.run --out out`
Expected: prints `Wrote bundle to out/ — ~200 countries, ~190 with TFR.` Inspect `out/meta.json` for coverage; investigate any factor with surprisingly low coverage before proceeding.

- [ ] **Step 7: Commit**

```bash
git add data-pipeline/fertility_pipeline/run.py data-pipeline/tests/test_run.py \
        data-pipeline/out/countries.json data-pipeline/out/factors.json data-pipeline/out/meta.json
git commit -m "feat(pipeline): add CLI orchestrator and generate country bundle"
```

---

## Self-Review

**1. Spec coverage (Phase 1A scope):**
- Country-level TFR + factor sourcing → Tasks 1, 3, 4, 5. ✅
- Full factor set minus Possibility (Economic, Education, Women's work & agency, Health & access, Structure, Community) → Task 1 registry. ✅ (Possibility Index is Phase 2, intentionally excluded.)
- No silent imputation → Tasks 4, 5 emit `null`; schema permits `null`; tested. ✅
- Transform decided empirically → Task 6. ✅
- Present snapshot, most-recent-non-null with year recorded → Tasks 3, 5. ✅
- Data contract for the web app → Task 7 schemas + `factors.json`/`countries.json`/`meta.json`. ✅
- Join key for TopoJSON (`iso_num`) → Tasks 2, 5 carry `iso_num` into each record. ✅
- Reproducible pipeline → Task 8 CLI. ✅

**2. Placeholder scan:** No "TBD"/"add error handling"/"write tests for the above" — every step has concrete code or an explicit data-curation instruction (Tasks 2.6, 4.6) with documented provenance. ✅

**3. Type consistency:** `fetch_indicator` returns `dict[iso3 -> (value, year)]` (Task 3), consumed identically by `build_records` (Task 5) and `run_pipeline` (Task 8). `build_records` output shape (with `factors` dict over `factor_ids()`) is consumed by `diagnostics.choose_tfr_transform` (Task 6, reads `r["tfr"]`/`r["factors"]`) and `emit.write_bundle` (Task 7). `transform_choice` is a `str` in {"raw","log"} produced by Task 6 and consumed by Task 7. Consistent. ✅

## Out of scope (later plans)
- Possibility Index (Phase 2): OSM amenity extraction + composite.
- 2004 snapshot (Phase 3).
- Sub-national datasets (Phase 4).
- Pronatalist-policy data (Phase 5).
- The web app that consumes this bundle (Plan 1B).
