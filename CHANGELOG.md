# Changelog

## Unreleased

- Patient directory adds private name, phone and RUT search, evolution filtering,
  deterministic sorting and exact ficha navigation. Optional phone/email can be
  saved or cleared; directory rows keep contact and RUT private.
- The compact desktop rail keeps Pacientes, Asistente and Chat selectable, with
  a guarded patient-directory brand link.
- Patient ficha has Resumen, Información, Clínica and Actividad. Manual notes and
  tooth conditions require explicit Guardar, retain revision history and support
  retry/conflict recovery. The permanent/primary odontogram has an equivalent
  accessible condition list. Evolutions retain explicit human approval.
- Manual conditions add explicit error correction: a reviewed reason with optional
  linked replacement marks the original Registrada por error without rewriting
  history, with atomic receipts and frozen-identical retry. Conflict recovery
  compares base/local/current per field with explicit choices instead of generic
  rebase. Current/historical filters, truthful actor labels and a shared
  backend-owned catalog with additive categories ship. The ficha commits canonical
  tab/clinical/condition URL state with dirty-draft guards; clinical text and
  identifiers never enter the URL.
- Activity reads saved evolution events and manual revisions with category filters,
  exact resource links and distinct empty/error/pagination states. Direct pending
  Assistant mode opens without acquiring a thread; starters remain unsent.
- Diagnosis mirrors the dental workspace: an illustrated eight-category palette with
  independently authored anatomy and a five-group legend. Without a tool, tooth
  activation only inspects; with a tool, whole-tooth or occlusal activation records
  directly and lateral surfaces confirm once. Preview and hover never write, and
  existing history, correction, retry and conflict recovery are preserved.
- Observed dental procedures ship as 63 fixed Spanish variants: single-tooth,
  multi-tooth bridge/splint with pillar/pontic roles, and whole-arch appliances, with
  reasoned corrections that retain original evidence.
- Planificación and Planes add patient-owned clinical plans: draft authoring with
  ordered procedures and sessions, confirmation, recorded acceptance, staged
  completion/cancellation, automatic completion, closure, reopening and archival
  with immutable actor/time history and no commercial side effects.
- Editable dental notes cover diagnosis, procedure and plan contexts with blank
  Spanish templates, optional tooth association, body-only edit, logical delete and
  per-note history; general notes stay separate and attachments are out of scope.
- The clinical catalog artifacts now pin `text eol=lf`, so the release-gate byte
  comparison and full backend suite pass on Windows checkouts as well as Linux.
