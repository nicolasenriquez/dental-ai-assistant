# Clinical Assistant

Mode: Operate. Targets: `ClinicalAssistant.tsx`, `ClinicalAssistantArea.tsx`.

Keep threads/conversation/optional Drive accessory. Conversations and Pending Work
are alternate sidebar views. Pending rows offer review, continue or Drive retry,
using their owning clinical endpoints. Pending query failure is never an empty state.
Direct `/assistant?view=pending` remains read-only on open/reload and acquires no
thread until Iniciar consulta. Supported starters prefill unsent editable text,
preserve the active patient and never overwrite an existing composer draft.
Collapsed desktop navigation retains the shared 56px global rail.

Pending Work separates clinical drafts/review from Drive synchronization, displays
the update date and time, and links failed exports to the exact saved evolution.
Grouping applies to loaded items and preserves pagination and explicit retry.
The sidebar visibly distinguishes the selected Conversations/Pending view.
Without an active patient, Drive Notes names its scope as general sources.
Quick Access appears only when more than three loaded files make it a useful subset.

Full and contextual views consume one attached runtime. Per-thread unsent notes,
queue and attachments are memory only. Logout clears them; hard reload restores
only server-persisted clinical work. Return to running detached work reconciles GET.

Read results dispatch by `result_kind`; fallback never prints internal payloads.
Terminology is general evidence, not patient findings. Approval names patient,
reviewed content and effect; clinical save stays separate from Drive synchronization.
