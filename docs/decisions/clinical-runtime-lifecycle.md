# Clinical runtime lifecycle

An authenticated React provider owns one attached clinical controller. Views
consume it rather than mounting separate reducers. Activating another thread
detaches the old transport. Leaving a clinical route detaches transport but keeps
composer, queue and attachment memory. Returning hydrates persisted state and
uses existing polling to reconcile a running server turn.

Closing contextual UI or Drive never invokes server cancellation. Stop explicitly
cancels. Logout unmounts authenticated state and clears all in-memory clinical
content. Hard reload restores persisted messages, artifacts and actions; unsent
composer text is intentionally not stored in the browser.

The server turn runner remains process-local. This change does not promise live
execution across server restarts or SSE replay. Persisted state remains authoritative.
