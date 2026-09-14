from __future__ import annotations

import importlib
import os
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from types import ModuleType

import pytest


def _reload_config() -> ModuleType:
    from backend import config

    return importlib.reload(config)


@contextmanager
def _config_with_timezone(
    monkeypatch: pytest.MonkeyPatch, value: str | None
) -> Iterator[ModuleType]:
    previous = os.environ.get("CLINICAL_TIMEZONE")
    monkeypatch.delenv("CLINICAL_TIMEZONE", raising=False)
    if value is not None:
        monkeypatch.setenv("CLINICAL_TIMEZONE", value)
    try:
        yield _reload_config()
    finally:
        monkeypatch.delenv("CLINICAL_TIMEZONE", raising=False)
        if previous is not None:
            monkeypatch.setenv("CLINICAL_TIMEZONE", previous)
        _reload_config()


def test_clinical_timezone_defaults_to_santiago(monkeypatch: pytest.MonkeyPatch) -> None:
    with _config_with_timezone(monkeypatch, None) as config:
        assert config.CLINICAL_TIMEZONE == "America/Santiago"
        assert config.CLINICAL_TIMEZONE_INFO.key == "America/Santiago"


def test_invalid_clinical_timezone_fails_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    with (
        pytest.raises(RuntimeError, match="CLINICAL_TIMEZONE"),
        _config_with_timezone(monkeypatch, "Not/A-Timezone"),
    ):
        pass


def test_approval_grouping_and_canonical_header_use_separate_timestamps(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    with _config_with_timezone(monkeypatch, None):
        from backend.evolution_exports.service import derive_period_key, format_journal_v1_header

        # Santiago is still on UTC-3 here: approval falls on Sunday night while
        # the canonical clinical timestamp is already Monday locally.
        approval_at = datetime(2026, 1, 5, 2, 30, tzinfo=UTC)
        evolution_at = datetime(2026, 1, 5, 3, 30, tzinfo=UTC)

        assert derive_period_key(approval_at, "daily") == "2026-01-04"
        assert derive_period_key(approval_at, "weekly") == "2026-W01"
        assert derive_period_key(evolution_at, "daily") == "2026-01-05"
        assert derive_period_key(evolution_at, "weekly") == "2026-W02"
        assert format_journal_v1_header(evolution_at) == "EVOLUCIÓN · 05-01-2026 · 00:30"
