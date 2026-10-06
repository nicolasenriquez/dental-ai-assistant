# Human interaction and visual acceptance contract

Closes reference review G01–G09 within approved D-01/D-02. This is a normative design companion, not a new clinical taxonomy or copy of DentalPin assets. The standalone HTML is synthetic and carries no persistence proof.

## Layout and hierarchy

Keep existing dark shell, logo and patient header. No new logo, dashboard or administrative navigation. Patient identity precedes clinical mode, which precedes selected FDI/concept. The work surface contains anatomy/tools; inspector appears alongside only when chart targets and text fit. At narrow available width, use named quadrant controls then a wrapping tooth grid and editor in normal document flow. A patient Assistant panel may reduce available width even at1440px, so use container space, not a viewport label.

The condition list remains below the work area, grouped by piece with one FDI label and separate records/actions. No card per field/surface/condition. One subdued border per work region, separators between groups; tonal surfaces for depth. Shadows only on an actual floating overlay, not every row. Buttons use existing semantic tokens/radii; primary local Save stays blue, cancel/history secondary. Global Nueva evolución stays in its existing header context.

Typography inherits DESIGN.md: body15px desktop/16px mobile inputs; headings16–20px in this region; FDI tabular numerals. UI action icons20px, condition marks20px palette/list and readable proportional chart marks, stroke1.6 consistent with incumbent ConditionSymbol. Clinical text remains explicit, never dependent on tooltip, color or a collapsed section.

## Symbol and status contract

One mapping drives palette/chart/editor/list/legend for the existing12codes. Reuse current authored symbols and labels; no imported paths or new medical meaning. A clinical-language review may identify a proposed glyph change, but taxonomy and semantics cannot be silently changed during implementation.

D-04/design decision9 fixes ownership: clinical labels and applicability come from the backend catalog; only original symbol geometry/status presentation is frontend-owned. History shares the same resolved entries. One populated diagnosis category is a heading, not a new tab bar. Empty Restauradora/Cirugía/Endodoncia/Ortodoncia tabs are not rendered. Future populated categories use server descriptors without a five-family UI whitelist and cannot change Condition lifecycle. Catalog reads can fail independently of condition/history reads; preserve saved facts and show an explicit catalog error rather than a guessed authoring palette.

Surface-capable codes accept an empty surface list under the existing contract. Describe that evidence as `Sin superficies especificadas`; reserve `Pieza completa, sin superficies` for codes with no surface support. Do not impose DentalPin's fracture whole-tooth rule. Selecting surfaces or navigating categories remains local and never writes.

| Existing code family | Base mark retained |
|---|---|
| pulpitis | Incumbent vertical channel/arrow mark, paired with Pulpitis text |
| caries | Filled circle |
| incipient_caries | Dotted circle |
| pigmentation | Three small spots |
| fracture | Zigzag |
| missing | Cross |
| periapical_lt_2mm / periapical_2_4mm / periapical_gt_4mm | Three circle sizes with exact existing text labels |
| rotated | Rotation arrow |
| displaced | Direction arrow |
| unerupted | Tooth below horizontal reference line |

Concept glyphs are not universal dental-standard certification. Distinct state treatment must not modify a concept's internal line pattern: incipient caries stays dotted in every state.

| State | Treatment | Text / accessible output |
|---|---|---|
| active | Base concept mark, normal contrast; surface fill from existing tokens | Activa |
| resolved | Muted base mark plus separate dashed outer status frame | Resuelta |
| entered_in_error | Muted base mark plus separate error/slash marker outside concept geometry; no active surface fill | Registrada por error; reason/history link |
| local draft | Blue selection boundary/preview, never inserted into persisted list/count | Borrador · Sin guardar |
| hover | Temporary neutral emphasis on piece and related rows | Does not change selected FDI, draft, note link or filter |
| keyboard focus | Existing visible focus ring, independent of selection | Named piece/control and selected/pressed state |
| saving | Local save pending indicator; no clinical status change yet | Guardando… |

Legend shows the three persisted status meanings and draft meaning briefly; extended concept explanation may open separately using the same catalog entries. It does not hide clinical facts. Names are always available; aria-hidden decorative SVG has adjacent text or a named piece button. A persisted code absent from catalog shows Condición no reconocida plus code; a server-supported entry lacking geometry retains its label with Símbolo no disponible and a neutral mark. Unknown category descriptors use Otra categoría plus key. These never masquerade as Caries or a filling and never hide saved records. Contrast/focus must be actually checked in future runtime, not inferred from a token name.

## Spatial orientation and linking

Preserve fdiTeeth order from toothGeometry.ts. Permanent upper18→11 then21→28; lower48→41 then31→38. Primary upper55→51 then61→65; lower85→81 then71→75. The left side of the frontal view is the patient's right; explicitly label it. Mobile quadrant navigation uses superior derecha(Q1/Q5), superior izquierda(Q2/Q6), inferior derecha(Q4/Q8), inferior izquierda(Q3/Q7) in that visual order.

Initially show the selected piece's quadrant; absent selection use upper patient-right. Opening a valid record focuses its dentition/quadrant and piece. Moving quadrant changes visible anatomy only, not selection or clinical filter; retain a selected-piece summary even while it is offscreen. All groups of clinical records remain in the list under the chosen dentition/status. No invisible filtering by displayed quadrant.

Both entry orders are allowed: piece→concept or concept→piece; until both are valid Save stays unavailable with explanation. Click/keyboard selects piece; hover only highlights. A list record names its condition and piece, opens that exact record and focuses the piece after any dirty guard. Multiple conditions on16 are distinct action targets, not one edit button on the entire group. Existing record's immutable fields cannot be changed by clicking another tooth. Existing guard offers discard/remain before replacing draft; no hover-bound note.

Use one visible FDI selection context. Cambiar pieza is an explicit new-draft action; dropdown remains an alternative. Targets44×44CSSpx minimum including quadrant controls. Never overlay overlapping full-chart targets to retain an apparent desktop layout. A reduced overview may be noninteractive only if the quadrant visual selector is clearly operable in the same region.

## Grouping and counts

Group with text Pieza16 then one semantic row per condition: mark+label, canonical surfaces or Pieza completa, explicit status and record-level Editar/Historial/Corregir as permitted. Notes remain readable through the existing record detail/edit affordance; do not create a separate note domain or sidebar binder. Clinical current facts must not be hidden by default.

For surface-capable empty records use Sin superficies especificadas rather than Pieza completa. Catalog-unavailable/unknown-code reading retains the stored extent without inferring applicability; actions follow design decision9 and the existing service lifecycle.

If counts are shown, label them as `8 condiciones · 5 piezas` only when the relevant selected dentition/status read is complete; compute distinct pieces from the complete confirmed set. Drafts never count. Incomplete reads show Datos incompletos and counts unavailable rather than fabricated zero or a total inferred from one page. No new metric endpoint is required solely for this optional display.

## Commit unit and state transitions

| State / event | Visible behavior | Allowed operation |
|---|---|---|
| Draft | FDI/concept summary, Sin guardar, inputs and Cancel/Save | Local editing; cancel no write |
| Save pressed | Guardando… in same action area; fields/attempt frozen | Exactly one create/edit/resolve/correct request |
| Confirmed create/edit | Condición guardada, piece retained, exact saved row focused | Refresh reads; optional explicit Registrar otra condición or Historial |
| Confirmed resolve | Condición resuelta; piece retained and exact resolved result accessible under its history filter | Refresh reads; no new clinical write |
| Confirmed correction with replacement | Corrección guardada; source and result links; focus replacement FDI/dentition/row | Refresh reads; no automatic new draft |
| Confirmed correction without replacement | Corrección guardada; focus original historical error record, reason visible | Refresh reads; no fabricated replacement |
| Confirmed write / subsequent read fails | Guardado confirmado + No pudimos actualizar la vista; keep response/receipt context | Reintentar lectura uses GET only, never replay POST/PATCH |
| Write response uncertain | No confirmamos el guardado; draft and UUID/body frozen | Explicit identical retry; no auto-send/new UUID |
| Definitive422 | Field error and retained draft | Correct input under existing retry rules |
| Definitive409 | Retained draft, save blocked, exact duplicate/current comparison | Owned existing link or field-aware review; no force-write |
| Definitive404 | Resource unavailable, retained draft | Read/recover/discard; no access widening |

Only clear dirty state after an authoritative success or explicit pre-save discard. A delayed response/refresh for patientA must not repaint patientB or focus its chart. Focus after save belongs to the exact returned resource; current default remains active when entering normally, but a resolve/correction result may deliberately expose its historical filter. Clinical status text and a polite live announcement confirm once, not duplicate toasts. New-row focus must not hide patient identity or place focus beneath a fixed control.

Correction names the preserved original separately from the optional new replacement. A labelled Sin reemplazo/Con reemplazo choice keeps reason mandatory in both modes. Without replacement, no replacement fields appear and review says no new resource will be created. With replacement, show its dentition, FDI, concept, surfaces and note under Nuevo registro de reemplazo; original identity remains plain context. A confirmed-write/failed-read correction shows receipt context and GET-only retry, not an editable replacement or another Save. D-03 recovery reviews base/current source and renewed consequence, while ordinary edit/resolve terminal recovery remains read/discard.

There is no Guardar odontograma/Finalizar examen button. Explicit manual labels are Guardar condición and Guardar corrección; resolve review names its consequence. The chart is a projection of confirmed individual records. Future exam approval needs a separate scope and cannot be implied by these saves. Next-action links into evolution/Assistant never automatically send a prompt or approve anything.

## Reference and verification matrix

[wireframes/odontogram-reference.html](wireframes/odontogram-reference.html) renders synthetic patient, piece16/CariesO and alternate display states. It is not connected to authentication or backend. State-picker changes presentation only; Save controls are intentionally non-mutating. Existing anatomy/profile paths are authored in Assistant, not extracted from Pin. It is a composition/state reference, not a substitute for runtime interactions.

Future proof at all six sizes: idle, draft, saving, saved, read_stale, uncertain, conflict, correction, whole_tooth and history/error. Include long patient name, long note, multiple conditions on one piece and temporal selection in implementation fixtures. Verify1440/1280/1024 with contextual Assistant open/closed using actual supported route/panel behavior; below768 use the existing full Assistant route, not invent a contextual mobile drawer. Narrow pane reflow must preserve selected FDI and draft.

Correction composition additionally covers without replacement and confirmed correction/failed subsequent read at all six sizes. The synthetic presentation selector changes these states without performing a write or GET; production proof must exercise actual requests and D-03 races separately.

The reference preview proves no page overflow for its own synthetic layouts and readable state composition; runtime44px targets, focus, keyboard, API/DB safety, screen reader, actual panel and virtual keyboard require later implementation verification. No decorative animations, decorative stickers or logo duplication is needed.
