# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: the treating dentist in an active consultation, with the patient present. They use the
app between or during appointments to turn a raw clinical note into a reviewed evolution, and to
consult the patient's ficha. Secondary users: clinic staff who consult patient records and documents.
The legacy RAG video chat targets course learners and remains a secondary surface.

## Product Purpose

Dental AI Assistant is an authenticated clinical workspace: a patient ficha, an AI-assisted evolution
workflow, optional voice dictation, and optional managed Google Drive export. Success means a dentist
finishes an accurate, human-approved evolution faster, without leaving the patient context, and every
persisted record was explicitly approved by a person.

## Positioning

The assistant drafts; the clinician decides. An evolution only reaches the ficha after explicit human
approval, and patient identifiers never reach model prompts in raw form. This separates it from
autonomous scribe tools and from generic chat assistants.

## Operating Context

- Browser app, authenticated session; Spanish clinical UI.
- Patients with ficha; evolutions reviewed and saved per patient.
- Clinical assistant threads with runtime states: streaming, stopping, awaiting approval, saving, failed.
- Voice dictation is optional; transcription feeds the composer, never auto-sends.
- Google Drive is an optional accessory for document context and export, never a prerequisite.
- Legacy surfaces (video-library chat, admin video library) coexist and share the shell.

## Capabilities and Constraints

- Patients: identity with masked RUT, birth date, evolution history.
- Evolutions: five structured fields, source-note provenance, review flags, stale-draft detection.
- Approval: required before persistence; declined/expired/failed outcomes are explicit.
- Privacy: RUT sanitization before prompts; masked identifiers in UI and notes.
- Rate limit: 25 messages per user per 24 hours (security invariant).
- Stack constraint: Postgres + pgvector, FastAPI, React; no ORM, no new state library, no new
  LLM/embedding provider without an authorizing ticket.

## Brand Commitments

Name: **Dental AI Assistant** (canonical). Legacy identifiers "AI Tutor" and "DynaChat" are kept only
for deployment identifiers and the secondary RAG chat. UI language is Spanish (Chilean clinical
register); technical documentation is English.

## Evidence on Hand

- `README.md`, `docs/` (API reference, clinical grounding, Drive evidence).
- `design-qa.md` and `docs/assistant-drive-ui-audit.md` — historical visual/UX evidence, not contracts.
- Playwright visual and ARIA snapshots under `app/frontend/tests/__snapshots__/`.
- Vitest suite covering clinical lifecycle, Drive, patients, chat, voice.
Do not fabricate testimonials, pricing, certifications, or clinical outcome claims.

## Product Principles

1. Human decides, AI drafts — nothing persists without explicit clinician approval.
2. Patient privacy is structural — identifiers are masked before prompts and in shared surfaces.
3. The clinical task outranks decoration — scanability, consistency, and task completion first.
4. Recovery over dead ends — user work survives failures, and every error names the next step.
5. One system, many surfaces — shared tokens, primitives, and patterns across clinical, Drive, and chat.

## Accessibility & Inclusion

- Spanish clinical language, plain recovery messages, no provider or runtime jargon.
- 44px minimum touch targets on coarse pointers; visible focus outlines; reduced-motion respected.
- Status is never communicated by color alone.
