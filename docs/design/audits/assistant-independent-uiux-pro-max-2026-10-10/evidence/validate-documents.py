"""Validate this audit's documentation only; does not exercise application behavior."""

import hashlib
import json
import re
import subprocess
from pathlib import Path

root = Path.cwd()
audit = root / 'docs/design/audits/assistant-independent-uiux-pro-max-2026-10-10'
change = root / 'openspec/changes/refine-clinical-assistant-ux'
before = json.loads((audit / 'evidence/spec-before.json').read_text(encoding='utf-8-sig'))
modified = []
requirements = 0
scenarios = 0
for name, original in before.items():
    current = (change / name).read_text(encoding='utf-8').replace('\r\n', '\n')
    original = original.replace('\r\n', '\n')
    if original != current:
        modified.append(name)
    if name.endswith('/spec.md'):
        for block in re.findall(r'### Requirement:.*?(?=#### Scenario:)', original, re.S):
            assert block.strip() in current, f'Requirement changed: {name}'
            requirements += 1
        for block in re.findall(r'#### Scenario:.*?(?=\n### |\n#### |\Z)', original, re.S):
            assert block.strip() in current, f'Scenario changed: {name}'
            scenarios += 1
expected = {'proposal.md', 'design.md', 'tasks.md', 'specs/clinical-agentic-feedback/spec.md'}
assert set(modified) == expected, modified
tasks_before = re.findall(r'^- \[([ xX])\] (\d+\.\d+) (.*)$', before['tasks.md'], re.M)
tasks_now_text = (change / 'tasks.md').read_text(encoding='utf-8')
tasks_now = re.findall(r'^- \[([ xX])\] (\d+\.\d+) (.*)$', tasks_now_text, re.M)
assert len({t[1] for t in tasks_now}) == len(tasks_now)
now_by_id = {t[1]: t for t in tasks_now}
assert all(now_by_id[t[1]] == t for t in tasks_before)
assert set(now_by_id) - {t[1] for t in tasks_before} == {'5.5'}
assert tasks_now_text.index('- [ ] 5.5') < tasks_now_text.index('## 7.')
assert 'Integrated tasks 6.2 and 6.3 also cover task 5.5' in tasks_now_text
feedback_before = before['specs/clinical-agentic-feedback/spec.md']
feedback_now = (change / 'specs/clinical-agentic-feedback/spec.md').read_text(encoding='utf-8')
assert feedback_now.count('#### Scenario:') == feedback_before.count('#### Scenario:') + 1
deps = {'C0': [], **{f'C{i}': ['C0'] for i in range(1, 6)},
        'C6': [f'C{i}' for i in range(1, 6)], 'Integrated': ['C6']}
def visit(node, stack):
    assert node not in stack, 'Dependency cycle'
    for dep in deps[node]:
        visit(dep, stack + [node])
for node in deps:
    visit(node, [])
freeze = json.loads((audit / 'evidence/independent-freeze.json').read_text(encoding='utf-8-sig'))
for entry in freeze:
    assert hashlib.sha256(Path(entry['Path']).read_bytes()).hexdigest().upper() == entry['Hash']
for doc in audit.glob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)', doc.read_text(encoding='utf-8')):
        if not target.startswith(('http:', 'https:')):
            assert (doc.parent / target.split('#')[0]).exists(), (doc.name, target)
status_now = subprocess.check_output(['git', 'status', '--short'], text=True)
status_before = (audit / 'evidence/git-status-before-refinement.txt').read_text(encoding='utf-8-sig')
def unaffected_status(text):
    return {line[3:]: line[:2] for line in text.splitlines()
            if line and not line[3:].startswith(('docs/design/audits/assistant-independent-uiux-pro-max-2026-10-10/',
                                                'openspec/changes/refine-clinical-assistant-ux/'))}
assert unaffected_status(status_now) == unaffected_status(status_before), 'Unrelated working changes changed'
assert not subprocess.check_output(['git', 'status', '--short', '--', 'app'], text=True).strip()
for name in ['browser-matrix-result.json', 'interactions-result.json', 'targeted-checks-result.json']:
    data = json.loads((audit / 'evidence' / name).read_text(encoding='utf-8-sig'))
    assert isinstance(data, dict) and data.get('requests'), name
result = {'status': 'PASS', 'original_requirements_preserved': requirements,
          'original_scenarios_preserved': scenarios, 'original_tasks_preserved': len(tasks_before),
          'added_task': '5.5', 'added_scenarios': 1, 'modified_spec_files': modified,
          'dependency_graph_acyclic': True, 'independent_freeze_unchanged': True,
          'unrelated_working_changes_preserved': True, 'application_changes': False,
          'application_tests_run': False, 'strict_validation_log': 'openspec-validation.txt'}
(audit / 'evidence/document-validation.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print(json.dumps(result, indent=2))
