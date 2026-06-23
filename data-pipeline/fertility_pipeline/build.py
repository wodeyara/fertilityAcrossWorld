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
