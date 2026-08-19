from fertility_pipeline import factors


def test_target_is_tfr():
    assert factors.TARGET.id == "tfr"
    assert factors.TARGET.source == "worldbank"
    assert factors.TARGET.code == "SP.DYN.TFRT.IN"


def test_factor_ids_are_unique():
    ids = factors.factor_ids()
    assert len(ids) == len(set(ids))
    assert "tfr" not in ids  # target is separate from explanatory factors


def test_every_factor_group_is_known():
    for f in factors.FACTORS:
        assert f.group in factors.GROUPS


def test_every_factor_has_a_source_code():
    for f in factors.FACTORS:
        assert f.source in {"worldbank", "static", "computed"}
        assert f.code, f"{f.id} missing code"
        assert f.direction in {"positive", "negative", "mixed"}
        assert f.unit


def test_expected_core_factors_present():
    ids = set(factors.factor_ids())
    assert {"gdp_pc", "urbanisation", "contraceptive", "flfp",
            "child_mortality", "adolescent_fertility", "fem_sec_enroll",
            "gini", "fem_years_schooling", "gii", "social_cohesion"} <= ids


def test_possibility_factor_present_and_computed():
    by_id = {f.id: f for f in factors.FACTORS}
    assert "possibility" in by_id
    p = by_id["possibility"]
    assert p.source == "computed"
    assert p.group == "Possibility"
    assert p.direction == "negative"
    assert "Possibility" in factors.GROUPS


def test_computed_factors_helper():
    assert [f.id for f in factors.computed_factors()] == ["possibility"]


def test_mobile_use_is_a_worldbank_connectivity_factor():
    f = next((f for f in factors.FACTORS if f.id == "mobile_use"), None)
    assert f is not None
    assert f.source == "worldbank"
    assert f.code == "IT.CEL.SETS.P2"
    assert f.group == "Connectivity"
    assert "Connectivity" in factors.GROUPS


def test_mobile_use_not_in_possibility_components():
    from fertility_pipeline import possibility
    assert "mobile" not in possibility.COMPONENTS
