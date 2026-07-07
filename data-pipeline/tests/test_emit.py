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
    assert all(v == 1 for v in meta["coverage"].values())


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


def test_write_bundle_accepts_us_registry(tmp_path):
    from fertility_pipeline import factors_us, emit
    records = [{
        "iso3": "CA", "iso_num": 6, "name": "California", "region": "West",
        "tfr": 1.52, "tfr_year": 2022,
        "factors": {fid: None for fid in factors_us.factor_ids()},
    }]
    records[0]["factors"]["income_pc"] = 41000.0
    records[0]["factors"]["possibility"] = 0.8
    meta = emit.write_bundle(records, "raw", 2022, tmp_path, registry=factors_us)
    import json
    factors_doc = json.loads((tmp_path / "factors.json").read_text())
    assert factors_doc["target"]["id"] == "tfr"
    assert {f["id"] for f in factors_doc["factors"]} == set(factors_us.factor_ids())
    assert meta["coverage"]["income_pc"] == 1
    assert meta["coverage"]["home_value"] == 0


def test_write_bundle_emits_policies_json(tmp_path):
    from fertility_pipeline import emit
    records = [
        {"iso3": "FRA", "iso_num": 250, "name": "France", "region": "Europe & Central Asia",
         "tfr": 1.8, "tfr_year": 2022, "factors": {"gdp_pc": 1.0}},
        {"iso3": "USA", "iso_num": 840, "name": "United States", "region": "North America",
         "tfr": 1.6, "tfr_year": 2022, "factors": {"gdp_pc": 2.0}},
    ]
    policies = {
        "FRA": {"stance": "raise",
                "measures": {"baby_bonus": True, "parental_leave": True,
                             "childcare_subsidy": True, "tax_incentive": True},
                "notes": "x"},
    }
    meta = emit.write_bundle(records, "raw", 2022, tmp_path, policies=policies)
    import json
    pol = json.loads((tmp_path / "policies.json").read_text())
    by_iso = {p["iso3"]: p for p in pol}
    assert by_iso["FRA"]["iso_num"] == 250
    assert by_iso["FRA"]["stance"] == "raise"
    assert by_iso["FRA"]["measures"]["baby_bonus"] is True
    # country with no policy record still present, all null
    assert by_iso["USA"]["stance"] is None
    assert by_iso["USA"]["measures"]["tax_incentive"] is None
    assert meta["policyCoverage"] == 1


def test_write_bundle_without_policies_emits_no_policies_json(tmp_path):
    from fertility_pipeline import emit
    records = [
        {"iso3": "USA", "iso_num": 840, "name": "United States", "region": "North America",
         "tfr": 1.6, "tfr_year": 2022, "factors": {"gdp_pc": 2.0}},
    ]
    meta = emit.write_bundle(records, "raw", 2022, tmp_path)
    assert not (tmp_path / "policies.json").exists()
    assert "policyCoverage" not in meta
