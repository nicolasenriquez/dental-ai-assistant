# Clinical Assistant

Mode: Operate. Targets: `ClinicalAssistant.tsx`, `ClinicalAssistantArea.tsx`.

Keep threads/conversation/optional Drive accessory. Conversations and Pending Work
are alternate sidebar views. Pending rows offer review, continue or Drive retry,
using their owning clinical endpoints. Pending query failure is never an empty state.

Full and contextual views consume one attached runtime. Per-thread unsent notes,
queue and attachments are memory only. Logout clears them; hard reload restores
only server-persisted clinical work. Return to running detached work reconciles GET.

Read results dispatch by `result_kind`; fallback never prints internal payloads.
Terminology is general evidence, not patient findings. Approval names patient,
reviewed content and effect; clinical save stays separate from Drive synchronization.
