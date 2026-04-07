import pytest

from poznote_mcp.server import _env_bool, _is_strict_bool_env_value


@pytest.mark.parametrize("value", ["true"])
def test_env_bool_accepts_true(monkeypatch, value):
    monkeypatch.setenv("POZNOTE_DEBUG", value)

    assert _env_bool("POZNOTE_DEBUG") is True


@pytest.mark.parametrize("value", ["false"])
def test_env_bool_accepts_false(monkeypatch, value):
    monkeypatch.setenv("POZNOTE_DEBUG", value)

    assert _env_bool("POZNOTE_DEBUG") is False


def test_env_bool_returns_default_when_missing(monkeypatch):
    monkeypatch.delenv("POZNOTE_DEBUG", raising=False)

    assert _env_bool("POZNOTE_DEBUG", default=False) is False
    assert _env_bool("POZNOTE_DEBUG", default=True) is True


@pytest.mark.parametrize("value", ["1", "0", "yes", "no", "on", "off", "", "   ", "banana", "TRUE", "FALSE", " true ", " false "])
def test_env_bool_rejects_non_boolean_values(monkeypatch, value):
    monkeypatch.setenv("POZNOTE_DEBUG", value)

    assert _env_bool("POZNOTE_DEBUG", default=False) is False
    assert _env_bool("POZNOTE_DEBUG", default=True) is False


@pytest.mark.parametrize("value", ["true", "false"])
def test_is_strict_bool_env_value_accepts_only_true_and_false(value):
    assert _is_strict_bool_env_value(value) is True


@pytest.mark.parametrize("value", ["1", "0", "yes", "no", "on", "off", "", "banana", "TRUE", "FALSE", " true ", " false "])
def test_is_strict_bool_env_value_rejects_other_values(value):
    assert _is_strict_bool_env_value(value) is False