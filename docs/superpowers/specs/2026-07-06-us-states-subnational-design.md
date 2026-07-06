# US States Sub-national Layer — Design Spec

Date: 2026-07-06
Status: Approved design, pre-implementation

## 1. Purpose

Add the first **sub-national scale** to the Unexplained Fertility Explorer: US
states. This proves the sub-national concept end-to-end — its own data pipeline,
its own regression model, and a scale selector in the web app — before we invest
in the harder layers (EU NUTS-2, India, DHS) in future specs.

The analytical question is identical to the global view, applied within one
country: **where is a US state's fertility higher or lower than its economic,
educational, cultural, and "possibility" profile predicts?** (E.g. Utah and South
Dakota tend to run high; New England runs low.)

This spec follows and does not change the parent design
(`2026-06-23-unexplained-fertility-explorer-design.md`). It realizes that spec's
Phase 4, scoped to the US-states layer only.

## 2. Scope

**In scope**
- 51 units: 50 states + District of Columbia.
- Present-day snapshot only (~2022 vintage; each source uses its latest clean
  release). Historical state snapshot deferred.
- A US-state-specific factor set and OLS model, fit independently of the global
  model (parent spec honesty rule §4.5: separate models per scale, never mixed).
- A **scale selector** in the web app (`World │ United States`) that swaps the
  active bundle, geometry, projection, factor list, and model across all four
  existing views (map / scatter / table / about).

**Out of scope (future specs)**
- US counties; EU NUTS-2; India states; ~90 DHS countries.
- Historical (generational) state snapshot and era toggle.
- Click-to-drill on the world map (scale selector only for this pass).

## 3. Units and geometry

- Unit key: **state FIPS code** (2-digit, e.g. `06` = California), which matches
  the `id` field of the standard Census `us-states` topojson.
- Geometry: a `us-states` topojson (states + DC) added to `web/public/data/`.
- Projection: `geoAlbersUsa` (handles Alaska/Hawaii insets). The world scale
  keeps `geoNaturalEarth1`. Projection is selected by active scale.

## 4. Factors (state-level covariate set)

State analogues of the global groups. All standardized (z-scored) before
modeling, same as global. Missing values are never imputed (parent spec §4.5.2).

| id | Group | Label | Source |
|---|---|---|---|
| `income_pc` | Economic | Per-capita personal income | Census ACS 2022 (B19301) |
| `home_value` | Economic | Median home value | Census ACS 2022 (B25077 / DP04) |
| `fem_bachelors` | Education | % women 25+ with bachelor's+ | Census ACS 2022 (S1501) |
| `flfp` | Labor | Female labor-force participation rate | Census ACS 2022 (S2301 / DP03) |
| `urbanisation` | Urbanization | % population urban | 2020 Census urban/rural |
| `social_capital` | Culture | Social Capital Project state index | JEC Social Capital Project |
| `religiosity` | Religiosity | % highly religious (**optional**) | Pew Religious Landscape Study |
| `possibility` | Possibility | State Possibility Index (composite) | OSM + ACS (see §5) |

- `religiosity` is included **only if** the Pew state table maps cleanly to all
  units; otherwise it is dropped from this pass (documented in `meta.json`).
- Direction metadata (positive/negative/mixed) is carried per factor, same as the
  global `factors.json`.

## 5. State Possibility Index

Built prominently, mirroring the global composite and its graceful-degradation
rule (a value is produced when ≥3 of its components are present).

Components (per state, z-scored, then averaged):
1. **Per-capita cultural/social amenities** — OSM Overpass count of the same
   amenity tag set used globally (bar, pub, cafe, restaurant, fast_food, cinema,
   theatre, nightclub, arts_centre), divided by state population. Overpass area
   filter by state via `ISO3166-2` (e.g. `US-CA`) or admin boundary; per-state
   negative-caching identical to the global `overpass.py` behavior.
2. **Broadband access** — % households with a broadband internet subscription
   (ACS S2801 / DP02).
3. **Urbanisation** — reused from the factor set (density of opportunity).
4. **Per-capita income** — reused from the factor set (economic reach).

Components 3–4 reuse already-fetched factor columns; components 1–2 are
Possibility-specific. If OSM times out for a state (rare at state scale), that
component is null and the composite falls back to the remaining components.

## 6. Data pipeline

A new sibling to the existing country pipeline. Mirrors its structure and
conventions (committed CSV artifacts, no silent imputation, schema-validated
emit, transform chosen by diagnostics).

- **`build_us_states.py`** (script, occasional run): pulls ACS via the public
  `api.census.gov` endpoints (keyless build), CDC state TFR, JEC social-capital,
  Pew (optional), and writes a committed `data/us_states.csv` (one row per FIPS,
  raw factor columns + tfr).
- **OSM**: reuse `overpass.py`; add a state-area query variant and a
  `data/cache/osm_us/` cache dir. Pre-seed negative cache for any state that
  times out so bundle regen stays fast.
- **Build step**: a `us_states` build path that (a) computes the Possibility
  composite, (b) runs `choose_tfr_transform` on the **state** TFR distribution to
  pick raw vs log (state TFRs are narrow ~1.5–2.4, so `raw` is likely — the data
  decides and the choice is recorded in `meta.json`), (c) emits a schema-validated
  bundle to `web/public/data/us/` as `countries.json` (units), `factors.json`,
  `meta.json` — structurally identical to the global bundle.
- **TFR source note**: CDC NCHS publishes state TFR in the annual Births final
  report / CDC WONDER Natality. The build script fetches the latest clean table;
  the committed CSV is the artifact of record. If a fully-automated fetch proves
  unreliable, the CSV is populated from the published NCHS table and the script
  documents the source table + vintage.

## 7. Web app changes

Kept deliberately minimal; the existing views become scale-agnostic rather than
duplicated.

- **Scale-agnostic unit type.** Introduce `Unit { id: string; joinId: number;
  name: string; region: string; tfr: number | null; tfr_year: number | null;
  factors: Record<string, number | null> }`. The global `Country` is the world
  instance (`id`=iso3, `joinId`=iso_num); the loader maps existing fields to
  `Unit`. All lib code (`regression`, `scatter`, `table`, `geo`) operates on
  `Unit` — a mechanical rename of `iso3`→`id`, `iso_num`→`joinId`.
- **Bundle loading by scale.** `loadBundle` is parameterized by scale path
  (`/data` for world, `/data/us` for states). Each scale carries its own
  `factors`, `target` (incl. transform), and `coverage`.
- **Scale state + selector.** App gains `scale: "world" | "us"`. A
  `Scale: World │ United States` control sits above or beside the view tabs.
  Switching scale swaps bundle + topojson + projection and resets factor
  selection to that scale's sensible defaults. Selected-unit state is per-scale
  (clearing on switch is acceptable for this pass).
- **MapView** accepts a projection choice and the active topojson; join uses
  `joinId`. **ControlPanel / Legend / ScatterView / TableView / DetailPanel**
  render against the active scale's factor list and fit with no structural
  change.
- **AboutView** gains a "Sub-national: US states" section — sources, the
  state Possibility Index, the separate-model rule, and a clear "present-day
  only" coverage note.

## 8. Testing

**Pipeline (pytest)**
- ACS field parsing (numeric coercion, missing → null).
- FIPS join between TFR, ACS, social-capital, and geometry id space.
- State Possibility composite: full components, and degraded (OSM component
  missing) still yields a value from ≥3 components.
- `choose_tfr_transform` runs on state TFR and records its choice in meta.
- Emitted bundle passes the existing JSON schema.

**Web (vitest + testing-library)**
- Loader maps `Country`/state records into `Unit` correctly (join ids intact).
- Switching scale re-renders on the state unit set with the state factor list.
- State model fits and produces a finite R² and residuals for a known state.
- Projection swap (world→us) selects `geoAlbersUsa`.
- Detail / scatter / table operate on a selected state without error.

## 9. Honesty & UX rules (inherited)

- Separate model per scale; never mixed (parent §4.5.1).
- No silent imputation; missing factor for a state → "insufficient data"
  (parent §4.5.2).
- Sub-national coverage is present-day only and clearly labeled as such.
- Possibility Index keeps its "experimental" badge at the state scale.

## 10. Deliverables

1. `data-pipeline` additions: `build_us_states.py`, state build path, OSM state
   variant, committed `data/us_states.csv`, tests.
2. Emitted `web/public/data/us/{countries,factors,meta}.json` + `us-states`
   topojson.
3. Web: `Unit` refactor, scale selector, scale-aware loading/map/projection,
   AboutView update, tests.
4. This layer merged to `main`, all tests green, build green.
