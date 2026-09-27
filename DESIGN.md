# Interface design contract

Dental AI Assistant and Chat share the dark workspace shell. The visual source of truth is the semantic palette and `--conversation-composer-*` tokens in `app/frontend/src/styles/globals.css`; mockup values are references, not separate component styles.

## Shared surfaces

- Both sidebars put Pacientes, Asistente, and Chat first, in that order. Each surface places its own creation action and history beneath this navigation.
- The expanded desktop sidebar is 260px on every surface and uses one shared brand mark.
- In Assistant and Chat, closing desktop navigation gives its full width to the workspace; the restore control moves to the workspace header. Desktop Patients retains its compact rail.
- The Assistant's Google Drive pane shares workspace width with the conversation. Its divider follows pointer movement immediately; open/close use a short spatial transition that respects reduced motion. Hiding Drive preserves its document state and leaves clinical work running.
- Conversation content and composers stay centered in the available main pane. Narrow-pane composition follows that pane's width rather than only the browser viewport.
- Both composers use the same surface color, border, radius, shadow, and focus ring. Assistant grows only when dictation or real document attachments require more room.
- On narrow screens, the Assistant header places its title and Google Drive action on the first row and the active patient on the second. The patient control includes the masked RUT and is the place to change patient.

## Clinical wording

- Evolution date and time fields display dd/mm/aaaa and HH:mm regardless of browser locale.
- Without an active patient, the composer is a general consultation. With one, it is a clinical note. Empty-state copy and the field label follow that distinction.
- A Drive selection is displayed as a named, removable document attachment. The word “contexto” does not label a patient action or an empty attachment slot.
- An approved evolution says “Guardada en ficha”. Drive sync is shown separately. Review flags on a saved evolution are “observaciones”; before approval they are “por revisar”.

Behavioral and safety priorities remain in `docs/design/UX_PRINCIPLES.md`.
