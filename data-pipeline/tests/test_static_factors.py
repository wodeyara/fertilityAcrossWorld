from pathlib import Path

import pytest

from fertility_pipeline import static_factors

FIXTURE = Path(__file__).parent / "fixtures" / "static_factors_sample.csv"
COLS = ["fem_years_schooling", "gii", "social_cohesion"]


def test_loads_values_keyed_by_iso3():
    data = static_factors.load_static_factors(FIXTURE, COLS)
    assert data["USA"]["fem_years_schooling"] == 13.4
    assert data["KOR"]["gii"] == 0.067


def test_empty_cell_is_none():
    data = static_factors.load_static_factors(FIXTURE, COLS)
    assert data["NER"]["social_cohesion"] is None


def test_only_requested_columns_returned():
    data = static_factors.load_static_factors(FIXTURE, ["gii"])
    assert set(data["FRA"]) == {"gii"}
    assert data["FRA"]["gii"] == 0.083


def test_missing_column_raises(tmp_path):
    f = tmp_path / "m.csv"
    f.write_text("iso3,gii\nUSA,0.18\n")
    with pytest.raises(ValueError, match="not found"):
        static_factors.load_static_factors(f, ["gii", "nonexistent"])


def test_non_numeric_cell_raises_with_context(tmp_path):
    f = tmp_path / "n.csv"
    f.write_text("iso3,gii\nUSA,N/A\n")
    with pytest.raises(ValueError, match="Non-numeric"):
        static_factors.load_static_factors(f, ["gii"])
