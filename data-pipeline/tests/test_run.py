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


def test_run_pipeline_offline_produces_valid_bundle(tmp_path):
    meta = run.run_pipeline(
        refs_path=FIX / "countries_ref_sample.csv",
        static_path=FIX / "static_factors_sample.csv",
        out_dir=tmp_path,
        start=2015, end=2024, snapshot_year=2023,
        fetch=fake_fetch,
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
    )
    fj = json.loads((tmp_path / "factors.json").read_text())
    assert fj["target"]["transform"] in {"raw", "log"}
