import json
from pathlib import Path

from fertility_pipeline import run

FIX = Path(__file__).parent / "fixtures"


def fake_fetch(code, start, end, session=None):
    # Return deterministic (value, year) per country for any indicator code.
    table = {
        "SP.DYN.TFRT.IN": {"USA": (1.66, 2022), "ISR": (2.89, 2022), "NER": (6.82, 2021)},
    }
    if code in table:
        return table[code]
    # generic factor: give USA and ISR a value, NER missing
    return {"USA": (50.0, 2022), "ISR": (40.0, 2022)}


def osm_stub(iso2_by_iso3, cache_dir, session=None, sleep=None):
    return {iso3: 1000 for iso3 in iso2_by_iso3}


def test_run_pipeline_offline_produces_valid_bundle(tmp_path):
    meta = run.run_pipeline(
        refs_path=FIX / "countries_ref_sample.csv",
        static_path=FIX / "static_factors_sample.csv",
        out_dir=tmp_path,
        start=2015, end=2024, snapshot_year=2023,
        fetch=fake_fetch,
        iso2_path=str(FIX / "iso2_sample.csv"),
        osm_fetch=osm_stub,
    )
    countries = json.loads((tmp_path / "countries.json").read_text())
    by = {c["iso3"]: c for c in countries}
    assert by["USA"]["tfr"] == 1.66
    assert by["NER"]["factors"]["gdp_pc"] is None  # fake_fetch omitted NER
    assert by["USA"]["factors"]["gii"] == 0.179
    assert meta["withTfr"] == 3
    assert (tmp_path / "factors.json").exists()


def test_transform_choice_is_written(tmp_path):
    run.run_pipeline(
        refs_path=FIX / "countries_ref_sample.csv",
        static_path=FIX / "static_factors_sample.csv",
        out_dir=tmp_path, start=2015, end=2024, snapshot_year=2023,
        fetch=fake_fetch,
        iso2_path=str(FIX / "iso2_sample.csv"),
        osm_fetch=osm_stub,
    )
    fj = json.loads((tmp_path / "factors.json").read_text())
    assert fj["target"]["transform"] in {"raw", "log"}


def test_run_pipeline_with_empty_static_factors(tmp_path):
    # Static factors entirely unpopulated must NOT empty the transform-decision
    # sample; the pipeline should still produce a bundle.
    empty_static = tmp_path / "empty_static.csv"
    empty_static.write_text("iso3,fem_years_schooling,gii,social_cohesion\n")
    meta = run.run_pipeline(
        refs_path=FIX / "countries_ref_sample.csv",
        static_path=empty_static,
        out_dir=tmp_path, start=2015, end=2024, snapshot_year=2023,
        fetch=fake_fetch,
        iso2_path=str(FIX / "iso2_sample.csv"),
        osm_fetch=osm_stub,
    )
    assert meta["withTfr"] == 3
    fj = json.loads((tmp_path / "factors.json").read_text())
    assert fj["target"]["transform"] in {"raw", "log"}


def test_build_possibility_combines_osm_and_wb(tmp_path):
    iso2 = {"USA": "US", "ISR": "IL", "NER": "NE"}

    def osm_fetch(iso2_by_iso3, cache_dir, session=None, sleep=None):
        return {"USA": 50000, "ISR": 8000, "NER": 200}

    def fake_fetch(code, start, end, session=None):
        # population + 4 WB components; give all three countries values
        table = {
            "SP.POP.TOTL": {"USA": (331_000_000, 2022), "ISR": (9_000_000, 2022), "NER": (25_000_000, 2022)},
            "IT.NET.USER.ZS": {"USA": (92.0, 2022), "ISR": (90.0, 2022), "NER": (10.0, 2022)},
            "IT.CEL.SETS.P2": {"USA": (110.0, 2022), "ISR": (140.0, 2022), "NER": (60.0, 2022)},
            "EN.POP.DNST": {"USA": (36.0, 2022), "ISR": (400.0, 2022), "NER": (20.0, 2022)},
            "SM.POP.NETM": {"USA": (900_000, 2022), "ISR": (30_000, 2022), "NER": (-20_000, 2022)},
        }
        return table.get(code, {})

    computed = run.build_possibility(iso2, tmp_path, fetch=fake_fetch, osm_fetch=osm_fetch)
    # All three have >=3 components -> all non-null; USA (rich, connected) > NER
    assert computed["USA"]["possibility"] is not None
    assert computed["NER"]["possibility"] is not None
    assert computed["USA"]["possibility"] > computed["NER"]["possibility"]
