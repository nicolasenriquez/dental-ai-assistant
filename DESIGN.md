# Interface design contract

Dental AI Assistant and Chat share the dark workspace shell. The visual source of truth is the semantic palette and `--conversation-composer-*` tokens in `app/frontend/src/styles/globals.css`; mockup values are references, not separate component styles.

## Shared surfaces

- Both sidebars put Pacientes, Asistente, and Chat first, in that order. Each surface places its own creation action and history beneath this navigation.
- The expanded desktop sidebar is 260px on every surface and uses one shared brand mark.
- Collapsed desktop navigation retains a 56px rail on Patients, Assistant and Chat. The guarded tooth brand links to `/patients` in its own row above the separate expansion toggle; all three global destinations remain selectable. Mobile retains the drawer.
- The Assistant's Google Drive pane shares workspace width with the conversation. Its divider follows pointer movement immediately; open/close use a short spatial transition that respects reduced motion. Hiding Drive preserves its document state and leaves clinical work running.
- Conversation content and composers stay centered in the available main pane. Narrow-pane composition follows that pane's width rather than only the browser viewport.
- Both composers use the same surface color, border, radius, shadow, and focus ring. Assistant grows only when dictation or real document attachments require more room.
- On narrow screens, the Assistant header places its title and Google Drive action on the first row and the active patient on the second. The patient control includes the masked RUT and is the place to change patient.
- The public login and signup pages use the same dark palette and tooth mark as the workspace. Desktop pairs the clinical purpose with the form; mobile stacks them with a short gap. Clinical language leads; the video library stays a secondary surface.
- In Drive, the selected section has a filled tab treatment. Keyboard focus has its own visible outline, so moving focus does not imply loading a different section.
- Clinical route navigation lives inside the workspace header's copy region, so
  returning to ficha does not overlap the sidebar restore control on narrow screens.
- Contextual clinical panels use the existing surfaces, composer and focus language.
  Closing a panel preserves work; the explicit Stop action cancels execution.
- Patient sections and category filters keep selection separate from keyboard focus. Selected
  controls use the existing surface, foreground and primary border tokens; focus has its own ring.
- Clinical records use plain status text alongside symbols. Activity groups saved events by day
  on a continuous guide and links to exact resources; missing author names are explicit.

## Clinical wording

- Evolution date and time fields display dd/mm/aaaa and HH:mm regardless of browser locale.
- Date fields pair direct entry with a calendar; evolution edits are applied or cancelled as one change. A copy action beside the draft reports success only after clipboard access succeeds and offers selectable text if it fails.
- Without an active patient, the composer is a general consultation. With one, it is a clinical note. Empty-state copy and the field label follow that distinction.
- A Drive selection is displayed as a named, removable document attachment. The word “contexto” does not label a patient action or an empty attachment slot.
- An approved evolution says “Guardada en ficha”. Drive sync is shown separately. Review flags on a saved evolution are “observaciones”; before approval they are “por revisar”.

Behavioral and safety priorities remain in `docs/design/UX_PRINCIPLES.md`.
