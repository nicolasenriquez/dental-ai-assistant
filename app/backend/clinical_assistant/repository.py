"""Compatibility import for the feature-local repository seam."""

from backend.db.clinical_assistant_repo import (
    ActionExpiredError,
    ClinicalRateLimitError,
    ProposalStaleError,
    TurnAlreadyRunningError,
    TurnIdempotencyConflictError,
    append_message,
    claim_turn,
    create_pending_action,
    create_thread,
    finish_turn,
    get_thread,
    list_threads,
    resolve_action,
    set_active_patient,
    update_title_if_default,
)

__all__ = [
    "ActionExpiredError",
    "ClinicalRateLimitError",
    "ProposalStaleError",
    "TurnAlreadyRunningError",
    "TurnIdempotencyConflictError",
    "append_message",
    "claim_turn",
    "create_pending_action",
    "create_thread",
    "finish_turn",
    "get_thread",
    "list_threads",
    "resolve_action",
    "set_active_patient",
    "update_title_if_default",
]
