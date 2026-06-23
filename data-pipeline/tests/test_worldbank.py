import json
from pathlib import Path

from fertility_pipeline import worldbank

FIXTURE = Path(__file__).parent / "fixtures" / "worldbank_tfr.json"


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


class FakeSession:
    def __init__(self, payload):
        self._payload = payload
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append((url, params))
        return FakeResponse(self._payload)


def _payload():
    return json.loads(FIXTURE.read_text())


def test_returns_value_and_year_per_country():
    session = FakeSession(_payload())
    result = worldbank.fetch_indicator("SP.DYN.TFRT.IN", 2015, 2024, session=session)
    assert result["ISR"] == (2.89, 2022)
    assert result["NER"] == (6.82, 2021)  # 2022 was null -> falls back to 2021


def test_takes_most_recent_nonnull():
    session = FakeSession(_payload())
    result = worldbank.fetch_indicator("SP.DYN.TFRT.IN", 2015, 2024, session=session)
    assert result["USA"] == (1.66, 2022)  # 2022 chosen over 2021


def test_builds_expected_url_and_params():
    session = FakeSession(_payload())
    worldbank.fetch_indicator("SP.DYN.TFRT.IN", 2015, 2024, session=session)
    url, params = session.calls[0]
    assert url.endswith("/country/all/indicator/SP.DYN.TFRT.IN")
    assert params["date"] == "2015:2024"
    assert params["format"] == "json"
