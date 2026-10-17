"""Validate planning artifacts only. No app imports, dependencies or mutations."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]

def consolidated():
    files = sorted((ROOT / "specs").glob("*/spec.md"))
    return "# Consolidated change requirements\n\nGenerated reading copy; capability deltas under specs/ are normative.\n\n" + "\n\n".join("# Capability: " + f.parent.name + "\n\n" + f.read_text(encoding="utf-8").strip() for f in files) + "\n"

def reaches(edges, source, target):
    pending = [source]
    visited = set()
    while pending:
        current = pending.pop()
        if current == target:
            return True
        if current not in visited:
            visited.add(current)
            pending.extend(edges[current])
    return False


def assert_semantic_prerequisites(edges):
    for before, after in [("1.5", "2.8"), ("2.7", "2.5"), ("2.8", "2.5"),
                          ("3.2", "3.7"), ("3.3", "3.7"), ("3.6", "3.7"),
                          ("2.6", "3.7"), ("3.8", "2.4")]:
        assert reaches(edges, before, after), f"Missing semantic prerequisite: {before} -> {after}"


def check_contract_examples():
    examples = json.loads((ROOT / "audit/history-examples.json").read_text(encoding="utf-8"))
    cases = examples["cases"]
    assert len(cases) == 10
    for case in cases:
        counts = case["expected_counts"]
        page = case["snapshot_page"]
        assert page["counts"] == counts
        assert len(page["items"]) == int(case["item_included"])
        if page["items"]:
            item = page["items"][0]
            assert item["resource_kind"] == case["kind"]
            assert item["chart_eligible"] == case["chart_eligible"]
            assert item["snapshot"]["deleted_at"] is None
            assert item["snapshot"].get("status", item["snapshot"].get("state")) == case["state"]
        assert counts["records"] == counts["findings"] + counts["procedures"]
        if case["deleted"]:
            assert not case["item_included"] and not case["chart_eligible"]
            assert counts["records"] == counts["charted_records"] == counts["affected_teeth"] == 0
            assert counts["deleted_records"] == 1
        else:
            drawable = case["state"] in {"active", "existing", "planned", "performed"}
            assert case["chart_eligible"] == drawable
            assert counts["charted_records"] == counts["affected_teeth"] == int(drawable)
            assert counts["records"] == 1 and counts["deleted_records"] == 0
    assert examples["bridge_expected_counts"]["charted_records"] == 1
    assert examples["bridge_expected_counts"]["affected_teeth"] == 3
    assert examples["whole_arch_expected_counts"]["affected_teeth"] == 0
    assert examples["whole_arch_expected_counts"]["affected_arches"] == 1
    event = examples["deletion_event"]
    assert event["action"] == "deleted" and event["after"]["status"] == event["before"]["status"]
    assert event["after"]["deleted_by_user_id"] == event["actor"]["user_id"]
    assert examples["empty_snapshot"]["coverage"]["state"] == "complete"
    assert examples["partial_snapshot"]["coverage"]["state"] == "partial"


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
    assert_semantic_prerequisites(edges)
    # Prove the old missing History dependency fails even when the graph stays acyclic.
    broken = {key: set(value) for key, value in edges.items()}
    broken["3.2"].discard("1.6")
    try:
        assert_semantic_prerequisites(broken)
    except AssertionError as error:
        assert "3.2 -> 3.7" in str(error)
    else:
        raise AssertionError("Missing-History regression was not detected")
    check_contract_examples()
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
    print(json.dumps({"tasks": len(ids), "completed": sum(x == "x" for x, _, _ in tasks), "requirements": len(reqs), "capabilities": 5, "dependency_graph": "acyclic", "semantic_prerequisites": "passed", "missing_history_regression": "detected", "contract_examples": "passed", "execution_membership": "exactly once", "local_links": "resolved", "consolidated_spec": "matches", "topological_order": sorted_ids}, indent=2))

if __name__ == "__main__":
    main()
