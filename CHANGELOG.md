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
