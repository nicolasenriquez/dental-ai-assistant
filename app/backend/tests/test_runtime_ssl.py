"""Regression test for Windows CPython OpenSSL TLS key logging."""

from __future__ import annotations

import os
import subprocess
import sys


def test_sslkeylogfile_does_not_abort_ssl_context_creation() -> None:
    """Ensure selected Python runtime handles SSLKEYLOGFILE without aborting."""
    environment = os.environ.copy()
    environment["SSLKEYLOGFILE"] = os.devnull

    result = subprocess.run(
        [sys.executable, "-c", "import ssl; ssl.create_default_context()"],
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
