"""Failing-first contracts for explicit, owner-bound evolution persistence."""

import inspect
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError


def test_evolution_repository_is_compositely_owner_scoped() -> None:
    from backend.db import evolutions_repo

    for name in ("create_evolution", "list_evolutions", "get_evolution"):
        params = inspect.signature(getattr(evolutions_repo, name)).parameters
        assert "owner_user_id" in params


def test_migration_uses_clinical_timestamp_and_composite_foreign_key() -> None:
    source = (
        Path(__file__).parents[1] / "alembic" / "versions" / "0006_add_patients_and_evolutions.py"
    ).read_text(encoding="utf-8")
    assert "evolution_at" in source and "timezone=True" in source
    assert "created_at" in source and "updated_at" in source
    assert "patient_id" in source and "owner_user_id" in source
    assert "ForeignKeyConstraint" in source


def test_save_request_requires_uuid_timestamp_and_three_text_versions() -> None:
    from backend.routes.evolutions import SaveEvolutionRequest

    assert set(SaveEvolutionRequest.model_fields) == {
        "id",
        "evolution_at",
        "raw_note",
        "generated_text",
        "final_text",
    }


@pytest.mark.parametrize(
    ("raw_note", "generated_text", "final_text"),
    [
        ("", "baseline", "approved"),
        ("   ", "baseline", "approved"),
        ("x" * 40_001, "baseline", "approved"),
        ("source", "baseline", "   "),
        ("source", "x" * 40_001, "approved"),
        ("source", "baseline", "x" * 40_001),
    ],
    ids=[
        "empty-source",
        "blank-source",
        "oversized-source",
        "blank-final",
        "oversized-generated",
        "oversized-final",
    ],
)
def test_save_rejects_invalid_source_or_blank_approved_record(
    raw_note: str, generated_text: str, final_text: str
) -> None:
    from backend.routes.evolutions import SaveEvolutionRequest

    with pytest.raises(ValidationError):
        SaveEvolutionRequest(
            id=uuid4(),
            evolution_at=datetime.now(UTC),
            raw_note=raw_note,
            generated_text=generated_text,
            final_text=final_text,
        )


def test_history_query_is_newest_first_and_uses_final_text_preview() -> None:
    from backend.db import evolutions_repo

    source = inspect.getsource(evolutions_repo.list_evolutions)
    assert "evolution_at DESC" in source
    assert "created_at DESC" in source
    assert "final_text" in source


def test_save_is_uuid_idempotent_and_conflicting_retry_is_recoverable() -> None:
    from backend.db import evolutions_repo
    from backend.routes import evolutions

    repository_source = inspect.getsource(evolutions_repo.create_evolution)
    route_source = inspect.getsource(evolutions)
    assert "id" in repository_source and "ON CONFLICT" in repository_source
    assert "409" in route_source
    assert "404" in route_source
    assert "422" in route_source


def test_conflict_lookup_does_not_reveal_another_owners_evolution() -> None:
    from backend.db import evolutions_repo

    source = inspect.getsource(evolutions_repo.create_evolution)
    assert "WHERE id = $1 AND owner_user_id = $2" in source


def test_latest_successful_baseline_is_persisted_without_flags() -> None:
    from backend.routes import evolutions

    source = inspect.getsource(evolutions)
    assert "generated_text" in source
    assert "final_text" in source
    assert "review_flags" not in source


def test_no_evolution_update_or_delete_routes_exist() -> None:
    from backend.main import app

    methods_by_path = {
        route.path: route.methods for route in app.routes if isinstance(route, APIRoute)
    }
    clinical_methods = {
        method
        for path, methods in methods_by_path.items()
        if "evolution" in path
        for method in methods or set()
    }
    assert "PATCH" not in clinical_methods
    assert "DELETE" not in clinical_methods
