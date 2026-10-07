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
finishes an accurate, human-approved evolution faster, without leaving the patient context.
General notes and tooth conditions are manual records saved explicitly by the clinician.

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

- Patients: private name/phone/RUT search, evolution filter, deterministic sort and exact ficha
  links. Search text stays in authenticated memory and request bodies; safe controls use the URL.
  Identity has masked RUT, birth date and optional phone/email, with deliberate header disclosure.
- Patient workspace: Resumen, Información, Clínica and Actividad. Summary prioritizes clinical
  approval/draft recovery and separates Drive status. New evolution remains primary.
- Manual notes and saved tooth-condition edits require explicit Guardar. Without a tool, tooth
  activation only inspects saved records. With an active tool, whole-tooth or occlusal-surface
  activation records a condition; lateral surface selection records on Confirmar. Tool selection
  and hover never write. Retry-safe commands, revision conflicts and history remain available;
  Deshacer marks the new record entered in error without deleting its history.
- Existing dental procedures: fixed Spanish variants in eight categories share the diagnosis
  chart and FDI list. Active-tool tooth/surface activation records observed work separately from
  findings. Saved-procedure edits require Guardar; reasoned corrections retain original evidence,
   replacement links and revision history. Bridges and splints use same-arch range/free selection
   and explicit confirmation as one procedure; bridge members retain pillar/pontic roles.
   Whole-arch appliances use an upper/lower picker without individual FDI members.
- Clinical plans: Planificación and Planes create/resume patient-owned drafts with ordered
  procedures and pending sessions. Confirmar moves a nonempty draft to pending; Registrar
  aceptación records a clinical event and activates it. Pending plans can reopen; draft/pending/
  active plans close with a reason; closed plans reactivate with history intact. Completed plans
  archive to read-only. Planned procedures remain separate from observed diagnosis records.
  Session execution belongs to the next implementation slice.
- Activity: persisted approved evolution saves and note/condition revisions, filtered by category
  with exact resource links. Counts and dates come from storage; unavailable authors stay unknown.
- Pending Work projects approvals, recoverable drafts and failed Drive exports;
  it does not create another clinical workflow or storage path.
- Evolutions: five structured fields, source-note provenance, review flags, stale-draft detection.
- Approval: required before persistence; declined/expired/failed outcomes are explicit.
- Privacy: RUT sanitization and request-local outbound pseudonymization of known
  patient identities, structured identifiers, emails and phones. Unknown free-text
  identities remain a documented limitation; this is not anonymization.
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

1. Human decides, AI drafts. Evolutions require explicit approval; manual notes and saved-condition
   edits require Guardar. Active-tool chart activation or surface confirmation explicitly records
   a manual condition. Navigation, inspection, tool selection and hover never persist changes.
2. Patient privacy is structural — identifiers are masked before prompts and in shared surfaces.
3. The clinical task outranks decoration — scanability, consistency, and task completion first.
4. Recovery over dead ends — user work survives failures, and every error names the next step.
5. One system, many surfaces — shared tokens, primitives, and patterns across clinical, Drive, and chat.

## Accessibility & Inclusion

- Spanish clinical language, plain recovery messages, no provider or runtime jargon.
- 44px minimum touch targets on coarse pointers; visible focus outlines; reduced-motion respected.
- Status is never communicated by color alone.
