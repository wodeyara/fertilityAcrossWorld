from fertility_pipeline import factors_us
from fertility_pipeline.factors import Factor


def test_target_is_tfr():
    assert factors_us.TARGET.id == "tfr"
    assert isinstance(factors_us.TARGET, Factor)


def test_expected_factor_ids_present():
    ids = set(factors_us.factor_ids())
    assert {
        "income_pc", "home_value", "fem_bachelors", "flfp",
        "urbanisation", "social_capital", "possibility",
    } <= ids


def test_possibility_is_the_only_computed_factor():
    computed = [f.id for f in factors_us.computed_factors()]
    assert computed == ["possibility"]


def test_static_factor_codes_match_ids():
    # static factor `code` is the us_states.csv column name; keep it == id for clarity
    for f in factors_us.static_factors():
        assert f.code == f.id


def test_groups_include_possibility():
    assert "Possibility" in factors_us.GROUPS
