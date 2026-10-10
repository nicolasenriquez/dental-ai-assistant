"""Sanitize a generated evidence copy, never the app or its configuration."""
import hashlib
import json
import re
from pathlib import Path

folder = Path(__file__).resolve().parent
bundle = folder / "build-parity/assets/index-CNNUBSZj.js"
original = bundle.read_bytes()
text = original.decode("utf-8")
redacted, count = re.subn(r"AIza[A-Za-z0-9_-]{30,}", "PUBLIC_BROWSER_KEY_REDACTED", text)
if count != 1:
    raise RuntimeError(f"Expected one browser key literal, found {count}")
# This is a complete rewrite of a generated evidence artifact only.
bundle.write_text(redacted, encoding="utf-8")
provenance = {
    "artifact": "build-parity/assets/index-CNNUBSZj.js",
    "original_tested_sha256": hashlib.sha256(original).hexdigest(),
    "sanitized_sha256": hashlib.sha256(bundle.read_bytes()).hexdigest(),
    "redactions": "One VITE_GOOGLE_PICKER_API_KEY browser literal removed; value never printed or retained in provenance.",
    "limit": "The retained JS is a sanitized copy, not byte-identical to the originally tested build. Screenshots/results refer to the original test; Picker was not exercised.",
    "runtime_changes": "None; container, source configuration and original environment remain unchanged.",
}
(folder / "build-parity-provenance.json").write_text(json.dumps(provenance, indent=2), encoding="utf-8")
print("Sanitized generated evidence bundle; recorded hashes without key value.")
