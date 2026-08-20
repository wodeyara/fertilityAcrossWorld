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
    factor_transforms = diagnostics.choose_factor_transforms(
        records, factors_us.factor_ids(), choice, quad_min_gain=0.05)
    return emit.write_bundle(records, choice, SNAPSHOT_YEAR, out_dir, registry=factors_us,
                             factor_transforms=factor_transforms)


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
