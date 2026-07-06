import json
from pathlib import Path

from fertility_pipeline import overpass

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "overpass_count.json").read_text())


class FakeResp:
    def __init__(self, payload):
        self._p = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._p


class FakeSession:
    def __init__(self, payload):
        self._p = payload
        self.calls = []

    def post(self, url, data=None, headers=None, timeout=None):
        self.calls.append((url, data, headers))
        return FakeResp(self._p)


def test_query_uses_out_count_and_area_filter():
    q = overpass.build_query("US")
    assert "out count;" in q
    assert '["ISO3166-1:alpha2"="US"]' in q
    assert "amenity" in q


def test_parse_count_reads_total():
    assert overpass.parse_count(FIXTURE) == 1350


def test_fetch_amenity_count_posts_query():
    session = FakeSession(FIXTURE)
    n = overpass.fetch_amenity_count("US", session=session)
    assert n == 1350
    assert session.calls[0][1]["data"]  # query body posted


def test_fetch_sends_user_agent():
    session = FakeSession(FIXTURE)
    overpass.fetch_amenity_count("US", session=session)
    headers = session.calls[0][2]
    assert headers is not None
    assert "User-Agent" in headers
    assert headers["User-Agent"]


def test_fetch_all_uses_cache(tmp_path):
    session = FakeSession(FIXTURE)
    calls = {"n": 0}
    fake_sleep = lambda s: calls.__setitem__("n", calls["n"] + 1)
    refs = {"USA": "US", "FRA": "FR"}
    first = overpass.fetch_all_amenity_counts(refs, tmp_path, session=session, sleep=fake_sleep)
    assert first == {"USA": 1350, "FRA": 1350}
    assert len(session.calls) == 2  # one API call per country
    assert calls["n"] == 2
    # second run hits cache only — no new API calls
    session.calls.clear()
    second = overpass.fetch_all_amenity_counts(refs, tmp_path, session=session, sleep=fake_sleep)
    assert second == {"USA": 1350, "FRA": 1350}
    assert len(session.calls) == 0
    assert calls["n"] == 2


def test_parse_count_raises_on_remark():
    import pytest
    with pytest.raises(overpass.OverpassError):
        overpass.parse_count({"remark": "runtime error: Query timed out", "elements": []})


def test_fetch_all_skips_failures(tmp_path):
    class FlakySession:
        def __init__(self):
            self.calls = []

        def post(self, url, data=None, headers=None, timeout=None):
            self.calls.append(data)
            if "FR" in data["data"]:
                return FakeResp({"remark": "timed out", "elements": []})
            return FakeResp(FIXTURE)

    session = FlakySession()
    refs = {"LUX": "LU", "FRA": "FR"}
    out = overpass.fetch_all_amenity_counts(refs, tmp_path, session=session, sleep=lambda s: None)
    assert out == {"LUX": 1350}  # FRA timed out -> skipped, not cached as 0
    # FRA is negative-cached (total null), so a re-run does not re-attempt it
    assert json.loads((tmp_path / "FR.json").read_text())["total"] is None
    session.calls.clear()
    out2 = overpass.fetch_all_amenity_counts(refs, tmp_path, session=session, sleep=lambda s: None)
    assert out2 == {"LUX": 1350}
    assert session.calls == []  # LU count cached, FR negative-cached -> no API calls


def test_query_supports_iso3166_2_tag():
    q = overpass.build_query("US-CA", tag="ISO3166-2")
    assert '["ISO3166-2"="US-CA"]' in q
    assert "out count;" in q


def test_fetch_all_threads_tag_and_keys_by_mapping_key(tmp_path):
    session = FakeSession(FIXTURE)
    out = overpass.fetch_all_amenity_counts(
        {"CA": "US-CA"}, tmp_path, session=session, sleep=lambda s: None, tag="ISO3166-2",
    )
    assert out == {"CA": 1350}
    # query used the state tag; cache file named by the area value
    assert '["ISO3166-2"="US-CA"]' in session.calls[0][1]["data"]
    assert (tmp_path / "US-CA.json").exists()
