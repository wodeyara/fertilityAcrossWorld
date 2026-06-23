import argparse

from . import factors as registry
from . import worldbank, countries_ref, static_factors, build, diagnostics, emit

TRANSFORM_MIN_COVERAGE = 0.6


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
    args = parser.parse_args(argv)

    meta = run_pipeline(args.refs, args.static, args.out,
                        args.start, args.end, args.snapshot_year)
    print(f"Wrote bundle to {args.out}/ — {meta['countryCount']} countries, "
          f"{meta['withTfr']} with TFR.")


if __name__ == "__main__":
    main()
