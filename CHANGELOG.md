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
- Activity reads saved evolution events and manual revisions with category filters,
  exact resource links and distinct empty/error/pagination states. Direct pending
  Assistant mode opens without acquiring a thread; starters remain unsent.
