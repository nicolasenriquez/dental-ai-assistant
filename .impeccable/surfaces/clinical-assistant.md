# Clinical Assistant

Mode: Operate. Targets: `ClinicalAssistant.tsx`, `ClinicalAssistantArea.tsx`.

Keep threads/conversation/optional Drive accessory. Conversations and Pending Work
are route-backed views; the sidebar keeps thread navigation available without
duplicating pending work in both panels. Pending rows offer review, continue or Drive retry,
using their owning clinical endpoints. Pending query failure is never an empty state.
Direct `/assistant?view=pending` remains read-only on open/reload and acquires no
thread until Iniciar consulta. Supported starters prefill unsent editable text,
preserve the active patient and never overwrite an existing composer draft.
Collapsed desktop navigation retains the shared 56px global rail.

Pending Work separates clinical drafts/review from Drive synchronization, displays
the update date and time, and links failed exports to the exact saved evolution.
Rows may show a 160-character excerpt of persisted content, redacted before truncation;
this is a read-only projection, not an AI-generated summary. Continue/review links retain
the thread route and carry the artifact/action ID in the fragment for exact focus.
Grouping applies to loaded items. Retry and visible-window refocus re-read a bounded
window through fresh cursors up to the opened depth, keep server totals and deduplicate
stable IDs; a failed later page keeps the last complete window and reports its own read
failure separately from the export-retry outcome. An explicit retry preserves the
surviving row's offset and focus, moves focus to the next/previous usable action or the
section when the row disappears, and announces the removal without claiming unsaved
work; passive refocus keeps focus and anchor.
The sidebar visibly distinguishes the selected Conversations/Pending view.
The full Assistant header keeps its `Pendientes` entry unless the expanded sidebar
visibly exposes that same destination: the collapsed rail, a hidden or closed mobile
drawer, and a focused entry all retain it, while the existing
`/assistant?view=pending` destination, the contextual navigation and the
shell's guarded transitions are unchanged.
Explicit retry links retain earlier attempts while showing the note once and
offering recovery only on the latest failed attempt. Legacy attempts are not
merged by matching their text. General replies offer Drive copy only with a patient.
Shared dictation uses six fixed-width bars driven by microphone audio; silence
settles the bars. Recording and transcription retain distinct controls, editable
text and cancellation, with no inactive Send control during dictation.
Empty draft rows remain visible and editable with less vertical spacing. Returning
from review to edit restores focus and the artifact heading into view.
Without an active patient, Drive Notes names its scope as general sources.
Quick Access appears only when more than three loaded files make it a useful subset.

Header allocates patient identity before thread metadata. Masked RUT occupies its own
line; return navigation never wraps. Short mobile viewports compact secondary header
controls while the composer is focused, retaining patient identity and ficha access.
Long evolutions expose a sticky native section selector and semantic section headings;
artifact headings follow their containing section — full Assistant h2 with h3 fields,
contextual h3 with h4 fields, manual review one level under its own section — with one
artifact representation and no wrapper headings added to force the hierarchy;
clinical text remains expanded. The contextual panel/Sheet keeps its outer
`Asistente clínico` title as the only shell heading: the embedded header omits that
exact repetition while keeping patient identity, navigation and controls, and the
contextual empty-state heading is h3, while the full route keeps h1 with empty h2. C1 field editors autosize between 180px and 480px,
with 16px input text. Section title and explicit Editar share a row, followed by
full clinical text and one separator. Footer reflows by artifact width.
Drive filenames wrap in full across Notes, Documents and Quick Access. Collection
read errors belong to their tab, offer retry, and never imply an empty collection.
Opening a Drive note is secondary to reviewing and saving clinical work.

A1 puts patient identity on an independent first row; navigation and auxiliary
controls follow, with thread metadata yielding first. Full patient names wrap.
Patient names use the compact 16px title size; masked RUT retains its own line.
Navigation and utilities share the second row above a 480px main pane; narrower
panes place utilities on a third row. Search focus surrounds the rounded patient
search row, including its icon, and remains visible after automatic focus.
The empty-state title is a section heading. Preparing an evolution is the primary
starter; starters still only prefill editable, unsent text. Consulted evolutions
show date and time using the shared clinical formatter to distinguish same-day records;
when two results display the same minute, each gets a visible ordinal within the
unchanged list (`Ver evolución 1 del …`) while unique rows, payload order, exact
destinations and the formatter value stay unchanged. Clinical conversation rows whose
rendered title and displayed update minute collide get the same presentation-only
treatment: a visible `Conversación N` ordinal assigned by ascending thread ID over
the full loaded group before search filtering, carried into the selection and
row-menu accessible names, recomputed when group membership, title or displayed
minute changes, and absent for unique rows; stored titles, list order, exact
destinations, guarded rename/delete and legacy Chat labels stay unchanged.
Only a focused composer in a mobile viewport <=600px high limits the visual name
to two lines; masked RUT stays visible and the full name returns on blur.
Drive Notes are general sources, Documents are patient-bound. Desktop header
refers to the active patient without repeating identity in the trail; mobile modal
keeps full name and masked RUT because it covers the Assistant.
Desktop Drive reflow is immediate, with no layout-property interpolation. Pointer
opening of the mobile overlay enters with opacity and translateX(12px) over 180ms,
cubic-bezier(0.23,1,0.32,1); dismissal cancels entrance immediately. Keyboard and
reduced-motion opening are immediate. Clinical loading/save/sync/patient states
use explicit text and existing progress indicators without moving clinical text.

Full and contextual views consume one attached runtime. Per-thread unsent notes,
queue and attachments are memory only. Logout clears them; hard reload restores
only server-persisted clinical work. Return to running detached work reconciles GET.
Unsent patient-context decisions use the shared modal with initial focus on the safe
choice (`Mantener paciente` / `Mantener sin paciente`), trap Tab and Shift+Tab, and name
origin, target and the affected text, sources and queue entries before any change. Escape,
remain and a cancelled upstream guard restore focus to the initiating patient control and
leave context and all work untouched; a failed patient update keeps the decision open with
its alert and enabled choices, and preserve/discard commit only after the guarded update
succeeds. Retained input names its original context and blocks
sending until restored. Unloaded threads offer loading/retry, never empty-thread starters.
A failed read keeps content, draft and edit buffers, names its scope (`No pudimos cargar…`
first load, `No pudimos actualizar…` refresh) and offers one same-thread `Reintentar carga`
read with no create, approval, recovery or Drive write; a late failure from another thread
stays silent. Failed or unverifiable saves belong to their artifact, which keeps its status
and `Verificar estado`; the composer dock repeats retry feedback only while the canonical
action is still pending, and independent read/turn/queue/source failures keep their own
owners. The `Ver borrador pendiente` dock is suppressed only while the pending artifact's
review region is fully measured inside the transcript's own scroll box; offscreen, occluded,
unmounted, unmeasurable or focused-dock states keep it, and activation scrolls to and focuses
the exact artifact without preparing, resolving or saving. Escape belongs to the open review
dialog, which closes itself without closing the contextual Sheet.
Unsent memory registers a native unload guard; confirming reload still loses it.
Queue entries are claimed before dispatch and rejected delivery requires explicit retry.
Unclaimed entries expose a visible `Quitar` named per entry; the claimed entry is not
removable, removal keeps remaining order and drafts, and removing the last entry retires
the failed-delivery lock.
Send acceptance is independent of generation success or detaching the SSE subscriber.
Stop names the current response (`Detener respuesta actual`) and the queue says
`Cancela sólo la respuesta actual. Hay N mensajes pendientes.`; stopping never pauses
or erases the queue, and no pause-all behavior exists. The composer summarizes
`Enter envía · Shift+Enter agrega una línea` through `aria-describedby`, hidden below
768px viewport and visually hidden under a 640px container. The composer reflows by
available container width, not the viewport: the textarea keeps a minimum 420px
writing row and the toolbar wraps below it when the current controls cannot fit
alongside it within that minimum, measured as a 716px pane wrapping and an 820px
pane sharing the row.
Attached sources and every voice state keep the textarea unclamped, the draft intact
and the required controls visible. Under coarse pointers every
assistant control reaches 44px through the shared coarse rule, including the header
action override for Pending and Drive; desktop toolbars keep their compact 40px targets.

Read results dispatch by `result_kind`; fallback never prints internal payloads.
Terminology is general evidence, not patient findings. Approval names patient,
reviewed content and effect; clinical save stays separate from Drive synchronization.
The existing approval dialog shows the prepared final text, masked RUT and draft review
observations. New and resumed artifacts use the same review action. Narrow headers
separate navigation from utilities; the resumed prompt has no growing vertical basis.
Drive patient selection returns to the requested section. Attaching content names the
next message; mobile returns to the composer without discarding the document buffer.

The pending list is shared by the global `/assistant?view=pending` view and the patient
summary: `Ver pendientes` mounts it inline with patient/kind scope, API-backed total and
exact `Revisar`/`Continuar` links. `Descartar` first reads the canonical thread read-only,
then confirms patient, exact work and consequences in the shared modal with `Mantener` as
the safe initial choice; Escape cancels, focus returns to the initiating control and one
resource-scoped lock prevents duplicates. Approval rejection reuses decline with the
complete expected-identity bundle; a recoverable draft uses the dedicated discard command
with one operation UUID retained across uncertain retries. Rows are removed only after a
confirmed response or stored receipt plus an authoritative fresh-cursor refresh; a lost
response keeps the row with `Verificar estado`/`Reintentar`, a matching receipt confirms,
another actor's approval is reported as saved, and absence alone never proves dismissal.
Discarded artifacts render closed and read-only (`Descartado`) with no prepare, edit,
recovery or approval controls. A confirmed dismissal with a failed refresh keeps the last
complete window and its read alert; patient counts refresh through the existing revision
callback, and under coarse pointers the confirmation controls reach 44px.
