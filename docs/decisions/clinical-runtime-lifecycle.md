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

Clinical retries create a new turn with optional `retry_of_turn_id`. The repository
accepts only an unchanged failed user turn in the same owned thread, without an
existing successor. Content and attached context are checked under the thread
lock; retries still consume the clinical quota. Attempts remain in history and
GET restores their relation. The transcript shows the note once, exposes the
earlier error as a disclosure, and offers retry only on the latest failed attempt.
Legacy attempts have no inferred relation. Inputs that never reached persistence
use an ordinary new send rather than linking to a nonexistent turn.
