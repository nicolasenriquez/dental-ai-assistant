## Why

The Clinical Assistant currently exposes one clinical job as separate draft, approval, result, and Drive surfaces, while the Drive workspace mixes global notes with patient-bound documents and has no durable evolution journal. Clinicians need one continuous, human-supervised workflow whose canonical PostgreSQL save remains reliable even when the secondary Drive export fails or is ambiguous.

## What Changes

- Make Google Drive closed by default and move its single launcher from the sidebar to the Assistant header, preserving guarded close behavior.
- Separate global external Notes, patient-bound managed documents, and evolution journals in the Drive workspace.
- Let users insert a complete Drive note or selection into the composer without sending it automatically.
- Present draft, review, save, canonical success, and Drive export as one persistent clinical artifact with independent clinical and Drive state.
- Persist a weekly-by-default export preference and duplicate-resistant lineage that yields one logical journal entry after a successful or reconciled export.
- Add safe journal creation, append, rollover, reconciliation, retry, listing, reading, and artifact-to-journal navigation.
- Preserve explicit human approval, owner scoping, existing SSE hydration, manual Drive draft saves, and Google boundary security.

## Capabilities

### New Capabilities

- `evolution-journals`: Durable daily or weekly Drive journals, duplicate-resistant evolution export, reconciliation, retry, listing, remote-content reading, and lineage navigation.

### Modified Capabilities

- `google-drive-managed-workspace`: Distinguish global Notes from patient-bound managed documents, split Picker intents, change the workspace launcher, and support explicit note-to-composer insertion.
- `clinical-agentic-feedback`: Compose each clinical draft, approval, canonical result, and secondary Drive status into one accessible artifact lifecycle.
- `conversational-runtime`: Block new queued turns during pending approval or canonical save while allowing conversation to resume during Drive-only synchronization.

## Impact

- Adds one Alembic migration, a focused export repository/service, and additive Drive/clinical API fields and routes.
- Changes Clinical Assistant, Drive workspace, transcript composition, typed API wrappers, and their existing Vitest/Playwright suites.
- Uses the installed React, FastAPI, asyncpg, Alembic, Google Drive integration, and UI primitives by default. Focused frontend interaction primitives may be added only under the dependency gate in `design.md`; no provider, framework, state library, styling system, animation library, or runtime service is introduced.
