import json
from pathlib import Path

import jsonschema

from . import factors as _default_registry
from .policies import MEASURE_COLS

SCHEMA_DIR = Path(__file__).resolve().parent.parent / "data" / "schema"


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


def _validate(instance, schema_name: str) -> None:
    schema = json.loads((SCHEMA_DIR / schema_name).read_text())
    jsonschema.validate(instance=instance, schema=schema)


def _build_policies_json(records: list[dict], policies: dict) -> list[dict]:
    empty_measures = {c: None for c in MEASURE_COLS}
    out = []
    for r in records:
        p = policies.get(r["iso3"])
        out.append({
            "iso_num": r["iso_num"],
            "iso3": r["iso3"],
            "stance": p["stance"] if p else None,
            "measures": dict(p["measures"]) if p else dict(empty_measures),
            "notes": p["notes"] if p else None,
        })
    return out


def write_bundle(records, transform_choice, snapshot_year, out_dir, registry=_default_registry, policies=None):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    factors_json = _build_factors_json(snapshot_year, transform_choice, registry)
    meta = _build_meta(records, snapshot_year, registry)

    _validate(records, "countries.schema.json")
    _validate(factors_json, "factors.schema.json")

    (out / "factors.json").write_text(json.dumps(factors_json, indent=2))
    (out / "countries.json").write_text(json.dumps(records, indent=2))

    if policies is not None:
        policies_json = _build_policies_json(records, policies)
        _validate(policies_json, "policies.schema.json")
        (out / "policies.json").write_text(json.dumps(policies_json, indent=2))
        meta["policyCoverage"] = sum(1 for p in policies_json if p["stance"] is not None)

    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta
