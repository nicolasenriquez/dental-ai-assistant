"""Validate planning artifacts only. No app imports, dependencies or mutations."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

def consolidated():
    files = sorted((ROOT / "specs").glob("*/spec.md"))
    return "# Consolidated change requirements\n\nGenerated reading copy; capability deltas under specs/ are normative.\n\n" + "\n\n".join("# Capability: " + f.parent.name + "\n\n" + f.read_text(encoding="utf-8").strip() for f in files) + "\n"

def main():
    assert (ROOT / "spec.md").read_text(encoding="utf-8") == consolidated(), "Consolidated spec drift"
    text = (ROOT / "tasks.md").read_text(encoding="utf-8")
    body, order = text.split("## Execution Order", 1)
    tasks = re.findall(r"^- \[([ x])\] (\d+\.\d+) (.*?)(?=^[-#]|\Z)", body, re.M | re.S)
    ids = [i for _, i, _ in tasks]
    assert len(ids) == len(set(ids)) == 26
    for checked, ident, description in tasks:
        assert "Traceability:" in description, ident
        if checked == "x":
            assert "Notes:" in description, ident
    for phase in range(5):
        numbers = [int(i.split(".")[1]) for i in ids if i.startswith(str(phase) + ".")]
        assert numbers == list(range(1, len(numbers) + 1)), phase
    chains = [re.findall(r"\d+\.\d+", line) for line in order.splitlines() if line.startswith("- Tasks:")]
    members = [i for chain in chains for i in chain]
    assert sorted(members) == sorted(ids), "Execution membership missing/duplicated"
    edges = {i: set() for i in ids}
    sections = re.split(r"^### ", order, flags=re.M)[1:]
    for section, chain in zip(sections, chains):
        for a, b in zip(chain, chain[1:]):
            edges[a].add(b)
        blocked = re.search(r"^- Blocked by: (.*)", section, re.M)
        if blocked:
            for upstream in re.findall(r"\d+\.\d+", blocked.group(1)):
                assert upstream in edges, upstream
                edges[upstream].add(chain[0])
    pending = set(ids)
    sorted_ids = []
    while pending:
        ready = sorted(i for i in pending if not any(i in edges[j] for j in pending))
        assert ready, "Dependency cycle"
        sorted_ids.extend(ready)
        pending.difference_update(ready)
    reqs = []
    for f in (ROOT / "specs").glob("*/spec.md"):
        reqs += re.findall(r"^### Requirement: ([A-Z]+\d+) ", f.read_text(encoding="utf-8"), re.M)
    assert len(reqs) == len(set(reqs)) == 27, reqs
    missing = []
    for f in ROOT.rglob("*.md"):
        for target in re.findall(r"!?\[[^\]]*\]\(([^)]+)\)", f.read_text(encoding="utf-8")):
            if target.startswith(("http:", "https:", "#", "mailto:")):
                continue
            target = target.split("#")[0].strip("<>")
            if target and not (f.parent / target).exists():
                missing.append(str(f.relative_to(ROOT)) + " -> " + target)
    assert not missing, missing
    print(json.dumps({"tasks": len(ids), "completed": sum(x == "x" for x, _, _ in tasks), "requirements": len(reqs), "capabilities": 5, "dependency_graph": "acyclic", "execution_membership": "exactly once", "local_links": "resolved", "consolidated_spec": "matches", "topological_order": sorted_ids}, indent=2))

if __name__ == "__main__":
    main()
