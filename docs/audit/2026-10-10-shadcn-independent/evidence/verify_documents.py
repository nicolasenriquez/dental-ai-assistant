"""Verify audit links and additive OpenSpec integrity; no application execution."""

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
AUDIT = Path(__file__).resolve().parents[1]
SPEC = ROOT / "openspec/changes/refine-clinical-assistant-ux"
before = json.loads((AUDIT / "evidence/spec-before.json").read_text(encoding="utf-8-sig"))


def normalize(text: str) -> str:
    return text.replace("\r\n", "\n")


preserved = []
for relative, original in before.items():
    current = normalize((ROOT / relative.replace("\\", "/")).read_text(encoding="utf-8"))
    previous = normalize(original)
    old_lines = [line for line in previous.splitlines() if line.strip()]
    cursor = 0
    current_lines = current.splitlines()
    for line in old_lines:
        while cursor < len(current_lines) and current_lines[cursor] != line:
            cursor += 1
        assert cursor < len(current_lines), f"Original line lost/changed: {relative}: {line}"
        cursor += 1
    preserved.append(relative)

task_key = next(key for key in before if key.endswith("tasks.md"))
task_pattern = r"^- \[([ xX])\] (\d+\.\d+) (.*)$"
old_tasks = re.findall(task_pattern, normalize(before[task_key]), re.M)
new_tasks = re.findall(task_pattern, (SPEC / "tasks.md").read_text(encoding="utf-8"), re.M)
new_by_id = {task[1]: task for task in new_tasks}
assert len(new_by_id) == len(new_tasks), "Duplicate task ID"
for task in old_tasks:
    assert new_by_id[task[1]] == task, f"Task text/status changed: {task[1]}"
added_tasks = [task[1] for task in new_tasks if task[1] not in {t[1] for t in old_tasks}]
assert added_tasks == ["1.4", "5.6"], added_tasks

old_requirements = []
old_scenarios = []
for relative, text in before.items():
    if relative.endswith("spec.md"):
        old_requirements.extend(re.findall(r"^### Requirement: (.+)$", normalize(text), re.M))
        old_scenarios.extend(re.findall(r"^#### Scenario: (.+)$", normalize(text), re.M))
requirements = []
scenarios = []
for path in SPEC.glob("specs/*/spec.md"):
    text = path.read_text(encoding="utf-8")
    requirements.extend(re.findall(r"^### Requirement: (.+)$", text, re.M))
    scenarios.extend(re.findall(r"^#### Scenario: (.+)$", text, re.M))
assert len(requirements) == len(set(requirements)), "Duplicate requirement name"
assert set(old_requirements) <= set(requirements)
assert set(old_scenarios) <= set(scenarios)
assert len(requirements) - len(old_requirements) == 2
assert len(scenarios) - len(old_scenarios) == 5

link_count = 0
for path in AUDIT.rglob("*.md"):
    for target in re.findall(r"\]\(([^)]+)\)", path.read_text(encoding="utf-8")):
        if target.startswith(("http:", "https:", "#")):
            continue
        assert (path.parent / target.split("#", 1)[0]).exists(), f"Missing link in {path}: {target}"
        link_count += 1

changed = subprocess.check_output(["git", "diff", "HEAD", "--name-only"], cwd=ROOT, text=True).splitlines()
assert not any(path.startswith("app/") for path in changed), "Application file modified"
spec_changed = [path for path in changed if path.startswith("openspec/")]
assert len(spec_changed) == 5 and all(path.startswith("openspec/changes/refine-clinical-assistant-ux/") for path in spec_changed)
result = {
    "original_spec_files_preserved": preserved,
    "original_task_count": len(old_tasks),
    "original_task_text_and_status_preserved": True,
    "added_task_ids": added_tasks,
    "added_requirement_count": 2,
    "added_scenario_count": 5,
    "local_markdown_links_verified": link_count,
    "application_files_modified": [],
    "changed_spec_files": spec_changed,
    "remaining_original_requirements_and_scenarios_preserved": True,
    "scope": "Documentation only; not runtime implementation validation",
}
(AUDIT / "evidence/document-validation.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps(result, indent=2))
