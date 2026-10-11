"""Read-only repository/document checks; write results only under this audit."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

root = Path(__file__).resolve().parents[5]
audit = Path(__file__).resolve().parents[1]
evidence = audit / 'evidence'
prefix = audit.relative_to(root).as_posix()


def git(*args: str) -> str:
    return subprocess.check_output(['git', *args], cwd=root, text=True, encoding='utf-8')


before = (evidence / 'git-status-before.txt').read_text(encoding='utf-8-sig')
after = git('status', '--short', '--untracked-files=all')
(evidence / 'git-status-after.txt').write_text(after, encoding='utf-8')


def outside(lines: str) -> set[str]:
    return {line for line in lines.splitlines() if line and prefix not in line}


missing = []
for doc in audit.rglob('*.md'):
    for target in re.findall(r'\]\(([^)]+)\)', doc.read_text(encoding='utf-8')):
        if target.startswith(('https:', 'http:', '#')):
            continue
        dest = target.split('#')[0].strip('<>')
        generated = {'final-verification.json', 'git-status-after.txt', 'artifact-manifest.json'}
        output = doc.parent / dest
        if dest and not output.exists() and not (output.parent == evidence and output.name in generated):
            missing.append({'document':doc.relative_to(audit).as_posix(),'target':dest})

required = ['README.md', '01_CODEBASE_PRIME_AND_JOURNEY.md',
            '02_IMPECCABLE_CRITIQUE_AUDIT.md', '03_UI_UX_PRO_MAX_RESEARCH.md',
            '04_EMIL_DESIGN_ENGINEERING.md', '05_IMPECCABLE_SHAPE_TO_BE.md',
            '06_IMPECCABLE_POLISH_REVIEW.md', '07_FINDINGS_TRACEABILITY.md',
            '08_OPENSPEC_CANDIDATES.md']
invalid_images = [p.name for p in evidence.glob('*.jpg') if p.read_bytes()[:3] != b'\xff\xd8\xff']
verification = {
    'head':git('rev-parse','HEAD').strip(),
    'required_reports_present':all((audit/name).is_file() for name in required),
    'application_unstaged_diff':git('diff','--name-only','--','app').splitlines(),
    'application_staged_diff':git('diff','--cached','--name-only','--','app').splitlines(),
    'authority_unstaged_diff':git('diff','--name-only','--','PRODUCT.md','DESIGN.md','.impeccable').splitlines(),
    'outside_status_added':sorted(outside(after)-outside(before)),
    'outside_status_removed':sorted(outside(before)-outside(after)),
    'external_additions_observed':'New Linux snapshots and release-gates results appeared outside this audit during the run. They were not produced or modified by this task and were preserved.',
    'missing_local_markdown_links':missing,
    'jpeg_count':len(list(evidence.glob('*.jpg'))),
    'invalid_jpeg_headers':invalid_images,
    'score_weighted':75.9,
    'score_rounded':76,
    'application_tests_run':False,
    'real_clinical_or_drive_writes':False,
    'no_open_spec_created_by_this_run':True,
    'phase_7_stopped':True,
    'limits':'Git status equality is not a content hash of pre-existing dirty files; no changes to those files were performed.',
}
(evidence/'final-verification.json').write_text(json.dumps(verification,indent=2,ensure_ascii=False),encoding='utf-8')
manifest = [{'file':p.relative_to(audit).as_posix(),'bytes':p.stat().st_size,
             'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in sorted(audit.rglob('*')) if p.is_file() and p.name!='artifact-manifest.json']
(evidence/'artifact-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(json.dumps(verification,indent=2,ensure_ascii=False))
if (missing or invalid_images or verification['outside_status_removed'] or verification['application_unstaged_diff'] or
    verification['application_staged_diff'] or not verification['required_reports_present']):
    raise SystemExit(1)
