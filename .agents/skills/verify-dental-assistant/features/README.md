# Dental Assistant browser feature map

Choose affected flow and list each entry point actually exercised. Run doctor, capture before/action/after evidence, and state which boundaries were real. Prefer read-only flows on shared database. Existing Playwright projects in `app/frontend/playwright.config.ts` use fixtures for many internal APIs; they prove browser behavior against those fixtures, not database persistence. Report skipped paths and why; a single entry point does not prove all sub-features.

| User feature | Map | Proof boundary |
| --- | --- | --- |
| Sign-in / signup navigation | [sign-in](sign-in.md) | Local-mode login; public-only proof if running mode differs |
| Patients | [patients](patients.md) | Authenticated UI and Postgres for real list/detail |
| Dental evolutions | [evolutions](evolutions.md) | Real approved save requires isolated account/data |
| Clinical assistant | [clinical assistant](clinical-assistant.md) | Local mode supports non-Drive flows; Drive needs separate Google-mode proof |
| Video-library chat | [library chat](library-chat.md) | Retrieval/model need configured OpenRouter |
| Google sign-in + Drive | [Google Drive](google-drive.md) | Opt-in headed Chrome, human sign-in/consent, real provider state |

Use `app/frontend/tests/app-baseline.spec.ts`, `clinical-assistant.spec.ts`, and `drive-bootstrap.spec.ts` as locator references, not as full-system evidence. For every proof, record feature ID, preconditions, user action, observed state and side effect, and cleanup. If visual baselines fail after auth setup succeeds, report those failures separately; do not relabel them as auth failures. Update this map when routes or visible controls change; re-drive affected flow with Playwright CLI.
