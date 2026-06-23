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
