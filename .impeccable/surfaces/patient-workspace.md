# Patient workspace

Mode: Operate. Targets: `PatientDetail.tsx`, `PatientWorkspace.tsx`, `PatientOverview.tsx`.

Patient create/edit form enters with opacity and scale(.98) over 180ms; its overlay fades
over 150ms, both using cubic-bezier(0.23,1,0.32,1). Reduced motion skips these entrances.
Closing stays immediate; focus and dirty-work guards do not wait for motion.
Patient form uses an opaque surface over an 80% dark backdrop. Narrow ficha titles
use 20px type with 1.25 line height and wrap the complete patient name.

The base patient route defaults to Resumen with four local sections: Resumen,
Información, Clínica and Actividad. A specific evolution URL selects Clínica >
Evoluciones inside the same ficha, retaining all four tabs and the selected detail.
History uses one shared list with date/time and an explicit return on narrow panes.
Leaving detail through a tab clears its UUID path; history return uses safe
`tab=clinical&clinical=evolutions` query state and survives reload.
Patient identity wraps by available width, including with the Assistant open.
New evolution remains primary, Assistant secondary.
New evolution comes first in the header action order. At <=480px pane width it
fills the first action row; Edit and Assistant share the second. Header actions
have 44px minimum targets. Patient tabs and activity filters use two equal columns
at that pane width. Mobile patient navigation reserves space outside the scrolling
main pane, so content never passes beneath its fixed trigger. Suggested actions
prefill but never send. Summary prioritizes clinical approval/drafts; Drive recovery
is separate. A failed read is unavailable with retry, never a fabricated zero.

Directory uses a semantic table at 1024px and mobile links below. Name/phone/RUT
search stays in PatientDirectoryProvider under RequireAuth and POST bodies; only sort/evolution filter
enter the URL. Directory rows hide RUT. Header Phone/Mail appear only when present;
IdCard reveals masked RUT. Hover/focus/tap disclosure supports Escape and outside
dismissal; Información provides contact and labelled copy actions.

Información contains manual notes with revision history. Clínica contains manual
Diagnóstico and approved Evoluciones. Selection is local; Guardar alone writes
notes/conditions. Dirty navigation offers save/discard/remain. Uncertain saves keep
the frozen UUID/payload for identical retry; 409 retains draft for explicit rebase.

Diagnosis puts the anatomical permanent/primary chart, tools and equivalent text
list before saved records. At 960px available width, a 300px inspector sits beside
the chart; otherwise it stacks. Narrow views have an enlarged selected-tooth editor
and 44px FDI selector. Hover/focus highlight is independent of the draft; active and
resolved conditions have symbols and text. All pages must load before a chart is
called complete; partial failure preserves confirmed records with retry.

Actividad groups persisted evolution saves and note/condition revisions by local
day. Todos/Evoluciones/Notas/Diagnósticos filters reset pagination. Titles, time and
counts come from owned sources; missing author names say Autor no disponible.
No clinical text, contacts or RUT appear in events. Exact UUID links read/focus the
latest resource even outside page1, with its revision history available. Page errors
retain known events and retry the same cursor; empty, loading and end are distinct.

B1 separates Resumen clínico (last approved evolution and saved count), clinical
pending work (approval and recoverable drafts with their respective exact links),
and failed Drive exports with recovery. API totals precede pagination and remain
unavailable with retry on failure. A failed export means a copy needs recovery;
it does not mean the approved evolution is missing from the ficha. Nueva evolución
stays the primary header action. Groups use spacing and separators, not nested cards.

Contextual Assistant is a nonmodal desktop panel >=1024px, modal right Sheet from
768px to 1023px, and the full Assistant route below 768px. Panel width is
`clamp(420px,38vw,520px)`; Sheet width `min(88vw,560px)`. Drive is available only
in the full Assistant. Escape closes contextual UI and restores the trigger.
The Sheet has one visible title and one close control. Evolution fields stack by
their own container width rather than the browser viewport.

Patient identity must stay visible. Context conflict names both patients or explains
a patient-less conversation's history; it never offers to reassign historical work.
Loading, query failure and empty work are distinct states. No invented metrics.
