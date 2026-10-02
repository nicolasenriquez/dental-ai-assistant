# Patient workspace

Mode: Operate. Targets: `PatientDetail.tsx`, `PatientWorkspace.tsx`, `PatientOverview.tsx`.

The base patient route shows a compact summary above the existing history/detail
workspace. A specific evolution URL stays focused on that evolution. New evolution
remains primary, Assistant secondary. Suggested actions prefill but never send.

Contextual Assistant is a nonmodal desktop panel >=1024px, modal right Sheet from
768px to 1023px, and the full Assistant route below 768px. Panel width is
`clamp(420px,38vw,520px)`; Sheet width `min(88vw,560px)`. Drive is available only
in the full Assistant. Escape closes contextual UI and restores the trigger.

Patient identity must stay visible. Context conflict names both patients or explains
a patient-less conversation's history; it never offers to reassign historical work.
Loading, query failure and empty work are distinct states. No invented metrics.
