from __future__ import annotations

import sys
from types import ModuleType
from types import SimpleNamespace
from unittest.mock import Mock

multipart = ModuleType("multipart")
multipart.__version__ = "0.0-test"
multipart_helpers = ModuleType("multipart.multipart")
multipart_helpers.parse_options_header = lambda value: value
sys.modules.setdefault("multipart", multipart)
sys.modules.setdefault("multipart.multipart", multipart_helpers)
sys.modules.setdefault(
    "whisper", SimpleNamespace(load_model=lambda _name: SimpleNamespace(transcribe=Mock()))
)

from app import _duration  # noqa: E402


def test_duration_falls_back_to_packet_timestamps(monkeypatch) -> None:
    run = Mock(
        side_effect=[
            SimpleNamespace(stdout="N/A\n"),
            SimpleNamespace(stdout="0.000000,0.020000\n1.980000,0.020000\n"),
        ]
    )
    monkeypatch.setattr("app.subprocess.run", run)

    assert _duration("recording.webm") == 2.0
    assert run.call_count == 2
