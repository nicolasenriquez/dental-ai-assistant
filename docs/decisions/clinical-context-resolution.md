# Clinical context resolution

Navigation context describes the page. Authentication identifies the owner.
`ClinicalTurnContext` binds authorized execution. Provider payload contains only
the minimum transformed data. These contracts are distinct.

`POST /api/clinical-threads/open-context` accepts patient, optional explicit thread
and evolution, and `mode` (`reuse_compatible` or `create_new`). It validates owned
relationships inside an owner-locked transaction. A new thread returns 201; reuse
returns 200. Ownership misses return 404, relationship mismatch 422 and context
conflict 409. `create_new` does not accept an explicit thread.

Explicit same-patient threads reuse without changing historical work. Only a
provably unused patient-less explicit thread receives a patient. Automatic opening
chooses most recently updated unfinished same-patient work, then unused owner work,
then creates. No old thread is deleted or reassigned with history.

Conflicts expose safe patient labels and allowed actions, not raw error strings.
The user may continue current work or create another thread atomically.
