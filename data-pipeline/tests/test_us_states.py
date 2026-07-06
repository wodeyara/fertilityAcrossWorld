import json
from pathlib import Path

from fertility_pipeline import us_states, factors_us

FIXTURE = Path(__file__).parent / "fixtures" / "us_states_sample.csv"


def test_load_us_states_parses_identity_and_raw():
    refs, tfr, raw = us_states.load_us_states(FIXTURE)
    assert refs["CA"].iso_num == 6
    assert refs["CA"].name == "California"
    assert refs["CA"].region == "West"
    assert tfr["UT"] == (1.92, 2022)
    assert raw["CA"]["population"] == 39000000.0
    assert raw["VT"]["broadband"] == 85.0


def test_build_us_possibility_yields_value_and_degrades():
    _, _, raw = us_states.load_us_states(FIXTURE)
    counts = {"CA": 120000, "UT": 8000, "VT": 1800}  # TX intentionally missing OSM
    comp = us_states.build_us_possibility(raw, counts)
    # states with >=3 present components get a value
    assert comp["CA"]["possibility"] is not None
    # TX has no amenity_density but still has broadband+urbanisation+income (3) -> value
    assert comp["TX"]["possibility"] is not None


def test_run_us_pipeline_emits_valid_bundle(tmp_path):
    out = tmp_path / "us"
    cache = tmp_path / "osm"
    fake_osm = lambda mapping, cache_dir, tag=None: {"CA": 120000, "UT": 8000, "VT": 1800, "TX": 40000}
    meta = us_states.run_us_pipeline(FIXTURE, out, cache, osm_fetch=fake_osm)
    countries = json.loads((out / "countries.json").read_text())
    factors_doc = json.loads((out / "factors.json").read_text())
    assert meta["countryCount"] == 4
    assert factors_doc["target"]["transform"] in ("raw", "log")
    ca = next(c for c in countries if c["iso3"] == "CA")
    assert ca["iso_num"] == 6
    assert ca["factors"]["possibility"] is not None
    assert ca["factors"]["income_pc"] == 41000.0
