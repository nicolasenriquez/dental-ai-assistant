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
the frozen UUID/payload for identical retry; 409 retains the draft and shows
base/local/current comparison with explicit per-field Mantener/Usar choices — no
generic whole-payload rebase. Untouched local fields adopt the latest values;
resolve must be re-confirmed against the current active state, and a second 409
repeats the comparison without losing the draft.

Diagnosis puts the anatomical permanent/primary chart, tools and equivalent text
list before saved records. At 1064px available width, a 300px inspector sits beside
the chart with a 20px gap and at least 744px for its main column; otherwise it stacks.
Below 744px chart width, quadrant controls preserve 44px tooth targets. Narrow views have an enlarged selected-tooth editor
and accessible quadrant controls. The redundant FDI combo and per-tooth surface bank are removed. Hover/focus highlight is independent of the draft; active and
resolved conditions have symbols and text. All pages must load before a chart is
called complete; partial failure preserves confirmed records with retry.

The palette is an illustrated eight-category registry with independently authored
lateral/occlusal profiles and variant motifs; cards use a 104px minimum grid, 72px
minimum height, 2px borders and 6px support dots, and the legend has five base groups
with explicit Existente/Planificado labels. A concept-colored tool preview runs about 1s and never
writes; planned chart overlays render at 0.7 opacity with a P marker and appear only
for the selected plan. Reduced motion suppresses preview rings and pulses but keeps
state text. The editable dental-note composer is shared by diagnosis, observed
procedures: free text without templates, tooth binding highlights linked members without replacing the candidate,
280-character and longer bodies grow the field, and body-only edits, logical deletes
and per-note history survive reload. One draft/feed survives the 320/384px rail and
the floating Sheet and guards dirty patient/mode changes; uncertain commands freeze
their exact payload for identical retry, and conflicts retain local text beside the
latest saved note.

Corregir registro is separate from Resolver condición. Active or resolved originals
open a guarded draft with a required reason and optional catalog-based replacement.
The confirmation names the masked patient, original evidence and error annotation;
only Guardar corrección writes. Uncertain attempts freeze the operation and complete
payload. A revision conflict requires renewed source review and confirmation of a
new attempt. Confirmed corrections expose exact original/replacement revision links;
failed refreshes retry GET only and never repeat the write.

Actividad groups persisted evolution saves and note/condition revisions by local
day. Todos/Evoluciones/Notas/Diagnósticos filters reset pagination. Titles, time and
counts come from owned sources; actors show the persisted trusted display_name or a
stable distinguishable account UUID label with full-UUID disclosure — never a
fabricated professional identity, email or RUT, and never Autor no disponible when a
UUID exists. No clinical text, contacts or RUT appear in events. Exact UUID links
read/focus the latest resource even outside page1, with its revision history
available. Page errors retain known events and retry the same cursor; empty, loading
and end are distinct.

Diagnosis defaults to Actuales while the API default stays all; Resueltas and
Registradas por error remain explicit historical filters with text/legend status.
Correction history shows the reason, actor and accessible original/replacement
links. The ficha commits canonical query state on every view change —
`tab=clinical&clinical=diagnosis|evolutions|planning|plans` plus a focused
condition/treatment/plan/dental-note UUID only inside its owning section; reload
restores it, unknown enums default deterministically, and clinical text/name/RUT
never enter the URL.

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

Old authorized plan links open stored evidence and revisions read-only. Diagnosis reads
exclude future planned work and keep observed records separate.

## Diagnosis simplification, 7 October 2026

Clinical navigation exposes Diagnóstico and Evoluciones only. Plan creation/editor components
are retired; old Activity links open read-only evidence and revision history. No persisted
plan or note is deleted by this cleanup. Notes have one header, a free-text composer and
semantic left-edge cards. Hover proposes a tooth only before typing; explicit tooth activation
can change the candidate while writing. The association checkbox remains optional.
The chart uses anatomical outline selection, clipped occlusal fills and a separate FDI row.
The surface dialog uses side-by-side occlusal and full lateral views. Keyboard users choose
a tooth then the five contextual surfaces. The chart keeps direct pointer surface activation.
Current/resolved filters remain; Historial completo includes error annotations, without a
separate daily error filter. Notes require at least 1160px available width for a rail;
otherwise the Sheet preserves the draft and returns focus to Notas on dismissal.
Selection is steady; card transitions and linked-note highlights respect reduced motion.
