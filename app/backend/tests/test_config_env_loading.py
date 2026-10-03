"""Regression coverage for ambient ``.env`` isolation (config bootstrapping).

A developer's gitignored docker-compose ``.env`` at the repo root (e.g.
``AUTH_MODE=google`` plus Drive keys) leaked into the pytest process via
``config._find_and_load_env``'s parent-directory walk, flipping 27 tests that
rely on clean defaults. The walk must stay disabled under pytest through the
explicit ``AI_TUTOR_DISABLE_DOTENV`` marker (PYTEST_CURRENT_TEST is not set
yet when conftest first imports the backend).
"""

from __future__ import annotations

from typing import Any


def _record_load_dotenv(calls: list[Any]) -> Any:
    def fake(**kwargs: Any) -> bool:
        calls.append(kwargs)
        return True

    return fake


def test_env_file_load_is_skipped_when_marker_set(monkeypatch) -> None:
    from backend import config as config_module

    calls: list[Any] = []
    monkeypatch.setattr(
        config_module,
        "load_dotenv",
        _record_load_dotenv(calls),
        raising=False,
    )
    monkeypatch.setenv("AI_TUTOR_DISABLE_DOTENV", "1")

    config_module._find_and_load_env()

    assert calls == []


def test_env_file_load_runs_when_marker_absent(monkeypatch) -> None:
    from backend import config as config_module

    calls: list[Any] = []
    monkeypatch.setattr(
        config_module,
        "load_dotenv",
        _record_load_dotenv(calls),
        raising=False,
    )
    monkeypatch.delenv("AI_TUTOR_DISABLE_DOTENV", raising=False)

    config_module._find_and_load_env()

    assert calls != []
