"""Read-only checks; generated reports stay inside this audit directory."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

root = Path.cwd()
audit = root / "docs/design/audits/assistant-2026-10-09"
evidence = audit / "evidence"
required = [
    "01_ASSISTANT_UX_CRITIQUE.md", "02_ASSISTANT_TECHNICAL_AUDIT.md",
    "03_ASSISTANT_FLOW_INVENTORY.md", "04_PLAYWRIGHT_E2E_REPORT.md",
    "05_ASSISTANT_UX_SHAPE_PROPOSAL.md", "06_ASSISTANT_IMPLEMENTATION_PLAN.md",
    "07_ASSISTANT_TRACEABILITY_MATRIX.md", "08_ASSISTANT_E2E_COVERAGE.md", "README.md",
]
missing = [name for name in required if not (audit / name).is_file()]
broken = []
for name in required:
    for target in re.findall(r"\]\(([^)]+)\)", (audit / name).read_text(encoding="utf-8")):
        if target.startswith(("http:", "https:", "#")):
            continue
        if not (audit / target.split("#")[0]).exists():
            broken.append({"document": name, "target": target})

def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=root, text=True).strip()

unstaged = git("diff", "--name-only").splitlines()
staged = git("diff", "--cached", "--name-only").splitlines()
non_audit_changes = [p for p in sorted(set(unstaged + staged)) if not p.startswith("docs/design/audits/")]
patterns = {"openai_style_key": r"sk-[A-Za-z0-9_-]{32,}", "google_api_key": r"AIza[A-Za-z0-9_-]{30,}", "jwt_literal": r"eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"}
secret_hits = []
for path in audit.rglob("*"):
    if path.suffix not in {".md", ".txt", ".json", ".js", ".html", ".log"}:
        continue
    text = path.read_text(encoding="utf-8", errors="replace")
    for label, pattern in patterns.items():
        if re.search(pattern, text):
            secret_hits.append({"file": str(path.relative_to(audit)), "pattern": label})
verification = {
    "branch": git("branch", "--show-current"), "head": git("rev-parse", "HEAD"),
    "required_documents": len(required), "missing": missing, "broken_local_links": broken,
    "unstaged_paths": unstaged, "staged_paths": staged,
    "non_audit_tracked_changes": non_audit_changes,
    "secret_literal_pattern_hits": secret_hits,
    "privacy_check_limit": "Pattern scan is not exhaustive; screenshots use intercepted synthetic data.",
    "index_handling": "No reset/commit; updated only the already-staged generated bundle to remove the browser key from index too. Other staged files preserved.",
}
(evidence / "document-verification.json").write_text(json.dumps(verification, ensure_ascii=False, indent=2), encoding="utf-8")
files = []
for path in sorted(audit.rglob("*")):
    if path.is_file() and path.name != "manifest.json":
        data = path.read_bytes()
        files.append({"path": str(path.relative_to(audit)).replace("\\", "/"), "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
(evidence / "manifest.json").write_text(json.dumps({"head": verification["head"], "files": files}, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"documents": len(required), "missing": missing, "broken_links": broken, "non_audit_changes": non_audit_changes, "secret_hits": secret_hits, "files_hashed": len(files)}, ensure_ascii=False))
if missing or broken or non_audit_changes or secret_hits:
    raise SystemExit(1)
