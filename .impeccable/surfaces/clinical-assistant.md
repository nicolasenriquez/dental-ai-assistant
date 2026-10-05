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
Grouping applies to loaded items and preserves pagination and explicit retry.
The sidebar visibly distinguishes the selected Conversations/Pending view.
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
clinical text remains expanded. C1 field editors autosize between 180px and 480px,
with 16px input text. Section title and explicit Editar share a row, followed by
full clinical text and one separator. Footer reflows by artifact width.
Drive filenames wrap in full across Notes, Documents and Quick Access. Collection
read errors belong to their tab, offer retry, and never imply an empty collection.
Opening a Drive note is secondary to reviewing and saving clinical work.

A1 puts patient identity on an independent first row; navigation and auxiliary
controls follow, with thread metadata yielding first. Full patient names wrap.
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

Read results dispatch by `result_kind`; fallback never prints internal payloads.
Terminology is general evidence, not patient findings. Approval names patient,
reviewed content and effect; clinical save stays separate from Drive synchronization.
