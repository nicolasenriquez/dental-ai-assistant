# Clinical grounding operations

## Catalog and deployment

The bundled catalog is `app/backend/data/dental_ai_glossary_es_cl_v1.json`:
dataset `dental-ai-basic-glossary-es-cl`, schema `1.0.0`, locale `es-CL`,
secondary language `en`, 161 concept entries, and 12 source records. The
reviewed canonical JSON SHA-256 is
`8efa6052cd045e7211d889009ffb30588cc5adc9bf53c6538dd36fd5b561f66a`
in the adjacent `.sha256` file. The digest covers sorted object keys, compact
JSON separators, Unicode UTF-8, and the original array order. Changing any
catalog content requires a new reviewed digest and source/provenance review.
The dataset's embedding/retrieval suggestions are metadata, not this runtime's
search contract; the runtime uses conservative lexical lookup, not vector RAG.

Alembic `0018` creates `clinical_terms` and `clinical_term_aliases`. At startup,
after migration and pool initialization, the app validates the catalog and
digest before catalog database writes, then
serializes sync under a transaction-scoped PostgreSQL advisory lock. An
unchanged schema version/checksum is a no-op. Changed content upserts active
concepts by stable dataset ID, replaces their aliases, inactivates absent IDs
without deleting provenance, and can reactivate returning IDs. Aliases have
structural languages: preferred Spanish `es`, preferred English `en`, and
dataset aliases `und`; there is no language inference. Cross-concept collisions
remain ambiguous. TAD, TMJ, CBCT, and BOP must each resolve to exactly one
active alias or startup fails closed. Invalid JSON, digest, source references,
schema, or transaction state also blocks startup; never bypass these checks to
recover availability. Inspect the data/digest and database migration first.

Term lookup accepts 1–8 raw terms. Exact preferred/alias resolution precedes
fuzzy suggestions. Original acronyms and normalized strings under five
characters skip fuzzy; eligible suggestions need ratio at least `0.80`, return
at most three concepts, and are never authoritative matches. Ambiguous and
unknown terms should remain uncertain or be clarified. The reviewed
`TAD en IZC` scenario yields matched TAD and unknown IZC—no invented IZC
expansion.

## Clinical ownership and lifecycle

The runtime, not the model, binds owner and active patient. Patient history
queries stay owner/patient scoped, contribute at most three distinct evolution
IDs to one turn, and never leak into the next turn. Self-contained notes do not
load history. Terminology supplies general definitions only and cannot create
patient findings, diagnoses, or treatment claims. Draft prose separates
`CURRENT_INPUT`, `PATIENT_EVIDENCE`, and `TERMINOLOGY_EVIDENCE`. Human approval
still gates canonical save; Drive export is subsequent and retryable, so an
export failure must not undo the clinical save or block the composer.

The clinical tool budget remains four calls. Presentation is governed by the
single mapping in `clinical_assistant/agent.py`: `silent` terminology,
`progress` history, `artifact` draft creation/update, and `human_gate` save
preparation. The client shows running progress only after a short delay and
prioritizes the resulting artifact. On unexpected stream loss, the client
hydrates the persisted thread with GET before showing a retry state. Component
loss does not cancel a detached server worker; explicit Stop uses the existing
cancellation path. Activity events are not durable. Durable replay, ownership
leases, and a unified turn/job state machine belong to the separate
`improve-clinical-run-lifecycle` follow-up, not this change.

Structured operational logs use bounded fields: capability/presentation
class, latency, call count and budget exhaustion, evidence counts, terminology
outcome, cancellation/reconciliation outcome and retry count, artifact outcome,
and failure class. Do not add raw clinical input, RUTs, tool arguments, provider
text, glossary definitions, or hidden reasoning to logs. When diagnosing a
failed turn, use persisted turn status and these fields before requesting any
clinical payload.

## Provenance and release hold

The supplied dataset's editorial policy describes its definitions as brief
paraphrases and carries per-entry `source_ids`. Those IDs reference ADA
(`ADA_GLOSSARY`), AAO (`AAO_GLOSSARY`), NIDCR (`NIDCR_CARIES`,
`NIDCR_PERIODONTAL`, `NIDCR_DRY_MOUTH`, `NIDCR_BRUXISM`, `NIDCR_TMD`),
MINSAL (`MINSAL_GUIDES`, `MINSAL_ORTHO_2026`,
`MINSAL_FHIR_SPECIALTIES`), and ISO (`ISO_3950`, `ISO_1942`). The JSON records
source URLs and scope, but no per-entry author, permission record, licensed
excerpt, or independent paraphrase audit. The supplied SHA-256 proves file
identity, not rights or clinical correctness.

The provenance review is complete as a finding, **not a clearance**. The user
confirmed personal, non-commercial use, but no written permission or entry-level
authorship evidence was supplied. The [ADA terms](https://engage.ada.org/pages/terms_and_conditions)
restrict reproduction/republication without permission; the
[AAO terms](https://www2.aaoinfo.org/terms-of-use/) limit copying and derivative
uses; and the [ISO copyright notice](https://www.iso.org/copyright.html)
restricts reuse, including AI/ML use of protected ISO content. NIDCR says
[most of its material is public domain, with exceptions](https://www.nidcr.nih.gov/about-us/web-policies).
The applicable permissions for these particular paraphrases, the ISO-backed
entries, and the MINSAL-backed entries have not been established. This is a
release hold: do not publish, redistribute, deploy, or synchronize this catalog
to a shared/production environment until the source owners' terms and the
dataset's authorship/provenance have been reviewed and documented. If clearance
cannot be established, replace affected entries with independently authored,
reviewed terminology and a new digest. Local implementation and mocked/scratch
database validation are not a release decision.
