# Dental Assistant browser feature map

Choose affected flow and list each entry point actually exercised. Run doctor, capture before/action/after evidence, and state which boundaries were real. Prefer read-only flows on shared database. Existing Playwright projects in `app/frontend/playwright.config.ts` use fixtures for many internal APIs; they prove browser behavior against those fixtures, not database persistence. Report skipped paths and why; a single entry point does not prove all sub-features.

| User feature | Map | Proof boundary |
| --- | --- | --- |
| Sign-in / signup navigation | [sign-in](sign-in.md) | Local-mode login; public-only proof if running mode differs |
| Patients | [patients](patients.md) | Authenticated UI and Postgres for real list/detail |
| Dental evolutions | [evolutions](evolutions.md) | Capture/failure retention locally; review/approved save requires enabled generation and disposable data |
| Clinical assistant and contextual workspace | [clinical assistant](clinical-assistant.md) | Selection/pending-work locally; successful generation requires enabled clinical LLM; Drive needs Google mode |
| Video-library chat | [library chat](library-chat.md) | Retrieval/model need configured OpenRouter |
| Google sign-in + Drive | [Google Drive](google-drive.md) | Opt-in headed Chrome, human sign-in/consent, real provider state |

Use `app/frontend/tests/app-baseline.spec.ts`, `clinical-assistant.spec.ts`, `clinical-workspace.spec.ts`, and `drive-bootstrap.spec.ts` as locator references, not as full-system evidence. The skill's Helpers section supplies a repeatable local browser check and a disposable-stack proof. For every proof, record feature ID, preconditions, user action, observed state and side effect, and cleanup. If visual baselines fail after auth setup succeeds, report those failures separately; do not relabel them as auth failures. Update this map when routes or visible controls change; re-drive affected flow. A partial helper pass is not complete map coverage; report untouched entry points and provider prerequisites.
