import argparse
import csv

from . import factors as registry
from . import worldbank, countries_ref, static_factors, build, diagnostics, emit
from . import overpass, possibility

TRANSFORM_MIN_COVERAGE = 0.6

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


def _transform_factor_ids(records):
    """Factor ids present for at least TRANSFORM_MIN_COVERAGE of TFR-bearing countries.

    The transform decision needs rows complete across the chosen factors; restricting
    to well-covered factors keeps that sample large instead of letting one sparse (or
    not-yet-populated) factor empty it.
    """
    n_tfr = sum(1 for r in records if r["tfr"] is not None)
    if n_tfr == 0:
        return []
    covered = []
    for fid in registry.factor_ids():
        cov = sum(1 for r in records
                  if r["tfr"] is not None and r["factors"].get(fid) is not None)
        if cov >= TRANSFORM_MIN_COVERAGE * n_tfr:
            covered.append(fid)
    return covered


def run_pipeline(
    refs_path,
    static_path,
    out_dir,
    start,
    end,
    snapshot_year,
    fetch=None,
    iso2_path="data/iso2.csv",
    cache_dir="out/raw/overpass",
    osm_fetch=None,
) -> dict:
    if fetch is None:
        fetch = worldbank.fetch_indicator

    refs = countries_ref.load_countries_ref(refs_path)
    static_ids = [f.code for f in registry.static_factors()]
    static_data = static_factors.load_static_factors(static_path, static_ids)

    tfr_result = fetch(registry.TARGET.code, start, end)
    wb_results: dict[str, dict] = {}
    for f in registry.worldbank_factors():
        wb_results[f.id] = fetch(f.code, start, end)

    iso2_all = load_iso2(iso2_path)
    iso2_by_iso3 = {iso3: iso2 for iso3, iso2 in iso2_all.items() if iso3 in refs}
    computed_data = build_possibility(iso2_by_iso3, cache_dir, fetch=fetch, osm_fetch=osm_fetch)

    records = build.build_records(refs, tfr_result, wb_results, static_data, computed_data)
    choice, _details = diagnostics.choose_tfr_transform(records, _transform_factor_ids(records))
    return emit.write_bundle(records, choice, snapshot_year, out_dir)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Build the country fertility data bundle.")
    parser.add_argument("--refs", default="data/countries_ref.csv")
    parser.add_argument("--static", default="data/static_factors.csv")
    parser.add_argument("--out", default="out")
    parser.add_argument("--start", type=int, default=2015)
    parser.add_argument("--end", type=int, default=2024)
    parser.add_argument("--snapshot-year", type=int, default=2023)
    parser.add_argument("--iso2", default="data/iso2.csv")
    parser.add_argument("--cache-dir", default="out/raw/overpass")
    args = parser.parse_args(argv)

    meta = run_pipeline(
        args.refs, args.static, args.out,
        args.start, args.end, args.snapshot_year,
        iso2_path=args.iso2,
        cache_dir=args.cache_dir,
    )
    print(f"Wrote bundle to {args.out}/ — {meta['countryCount']} countries, "
          f"{meta['withTfr']} with TFR.")


if __name__ == "__main__":
    main()
