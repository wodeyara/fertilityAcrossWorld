# Connectivity Factors — Design Spec

Date: 2026-07-07
Status: Approved design, pre-implementation

## 1. Purpose

Add a "Connectivity" factor to each scale of the Unexplained Fertility Explorer,
capturing digital connectivity as a possible driver of (lower) fertility:

- **US states:** smartphone adoption — the true smartphone metric, from ACS.
  This replaces the `religiosity` factor, which has never had a fetchable source.
- **World countries:** mobile-phone subscriptions, from the World Bank. To keep
  it a *distinct* predictor, mobile is simultaneously **removed from the
  Possibility index composite** (where it currently double-counts).

Separate models per scale (parent spec §4.5), so the two scales use different
indicators and units; they are never mixed.

## 2. US states — `smartphone` replaces `religiosity`

- **Factor:** id `smartphone`, label "Smartphone in household", group
  "Connectivity", source `static` (CSV column), code `smartphone`, direction
  `negative`, unit "% of households".
- **Source:** Census ACS 2022 1-yr table **B28001** — `B28001_005E`
  (households with a smartphone) / `B28001_001E` (total households) × 100.
  Verified: California ≈ 93.5%. Fetched with the existing Census key.
- **`factors_us.py`:** remove the `religiosity` Factor; add the `smartphone`
  Factor. Remove "Religiosity" from `GROUPS`, add "Connectivity".
- **`build_us_states.py`:** add `B28001_005E`/`B28001_001E` to the ACS detail
  fetch; compute the smartphone % into a new `smartphone` column; drop the
  `religiosity` column. The static lookup `data/us_social_religion.csv` (which
  carried only `social_capital`, with `religiosity` blank) is renamed to
  `data/us_social_capital.csv` with just `iso3,social_capital`; the loader
  becomes `load_social_capital()`.
- **Tests:** `test_factors_us.py` updated — expected factor ids include
  `smartphone`, exclude `religiosity`; groups include "Connectivity", exclude
  "Religiosity".
- Re-emit the US bundle → `smartphone` populated 51/51, `religiosity` gone.

## 3. World — add `mobile_use`, de-duplicate Possibility

- **Factor:** id `mobile_use`, label "Mobile subscriptions", group
  "Connectivity", source `worldbank`, code `IT.CEL.SETS.P2`, direction
  `negative`, unit "per 100 people".
- **`factors.py`:** add the `mobile_use` Factor; add "Connectivity" to `GROUPS`.
  The world pipeline already fetches every `worldbank_factors()` entry, so no
  `run.py` change is needed for the fetch of this factor.
- **De-duplicate Possibility:** remove the `mobile` component so the same
  indicator is not both a standalone factor and a Possibility ingredient.
  - `run.py`: remove `"mobile": "IT.CEL.SETS.P2"` from `POSSIBILITY_WB_CODES`
    and drop the `mobile` entry from the `components` dict in `build_possibility`.
  - `possibility.py`: remove `"mobile"` from the `COMPONENTS` constant.
    `MIN_COMPONENTS` stays 3; Possibility now composes from `amenity_density`,
    `internet`, `pop_density`, `net_migration` (4 components, ≥3 required).
- **Tests:** `test_possibility.py` / `test_run.py` updated so no test asserts a
  `mobile` component; a composite with the four remaining components still
  yields a value and still degrades to `None` below 3 present.
- Re-emit the world bundle, **reusing the cached OSM amenity counts**
  (`out/raw/overpass`) so no slow Overpass refetch is needed. Possibility values
  shift slightly (mobile no longer contributes); `mobile_use` populated for the
  countries WB reports it.

## 4. Collinearity note (honesty)

`mobile_use` and the Possibility index's `internet` component are correlated;
selecting both the Possibility index and Mobile subscriptions together
introduces collinearity. This is disclosed in the About view — the tool lets
users control for whatever they choose; it does not silently prevent it.

## 5. Web app

No structural change. The control panel groups factors by `group`, so the new
"Connectivity" group appears automatically once the bundles carry it. The only
web edit is an About-view sentence noting the new Connectivity factors and the
mobile/Possibility-internet collinearity caveat.

## 6. Testing

- **Pipeline:** `factors_us` ids/groups (smartphone in, religiosity out);
  `factors` has `mobile_use` as a worldbank factor; `possibility` COMPONENTS no
  longer include mobile and the composite still computes + degrades correctly;
  `build_us_states` smartphone math (`B28001_005E/_001E`); the renamed
  social-capital lookup loads. Full suite green.
- **Web:** existing suite green (factor rendering is data-driven; no new
  component). About-view test asserts the Connectivity/collinearity note.

## 7. Out of scope

- A true world smartphone-penetration metric (no clean free source exists).
- Any change to the residual engine, projections, scale selector, or policy
  overlay.

## 8. Deliverables

1. `factors_us.py` + `factors.py` + `possibility.py` + `run.py` registry/composite
   edits; `build_us_states.py` ACS smartphone sourcing; renamed
   `data/us_social_capital.csv`; updated pipeline tests.
2. Re-emitted `web/public/data/us/*` (smartphone) and `web/public/data/*`
   (mobile_use + recomputed Possibility) bundles.
3. About-view Connectivity note; updated web test.
4. Merged to `main`, all tests green, build green.
