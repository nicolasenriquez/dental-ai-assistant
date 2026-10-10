# Matriz de trazabilidad

2026-10-09 · Checkout `7345f7a` · Referencias de fuente relativas a `app/frontend/src/` salvo `backend/`.

## Hallazgo → evidencia → contrato → causa → propuesta → slice

| ID | Severidad / naturaleza | Browser / test evidence | Contrato relacionado | Causa/localización probable | Shape | Slice y gate |
|---|---|---|---|---|---|---|
| F01 | P1, bug B-C | `stop-race-result.txt`; A07/A09 | Conversational runtime: aislación de hilo/turno; draft continuity | `hooks/useClinicalAssistant.ts:902–947`, refs/callbacks Stop sin scope completo | Continuidad por identidad | S1; cancel A no afecta B |
| F02 | P1, riesgo contextual B-S+I | `edit-context-result.txt`, `attachment-patient-removed.png`; A04/A14 | Clinical surface: patient context, no silent transfer | `ClinicalAssistantArea.tsx:73–95,158–171` | D01 frontera explícita | S6; cambio A/B/null conserva vínculo elegido |
| F03 | P1, bug B-S+I | `draft-without-patient.png`; A04/A15 | Artefacto persistente conserva patient context | `ClinicalTranscript.tsx:266`; `ClinicalEvolutionArtifact.tsx:326` | D02 identidad histórica | S3; header null/B no oculta A |
| F04 | P1, pérdida local B-C | `checkout-edit-result.txt`, `field-edit-*`; A16 | Preserve drafts / dirty transitions | `EvolutionReviewArtifact.tsx:90–116,160–162` | D03 buffer dirty | S2; navegación no pierde texto |
| F05 | P1, bug B-C | `checkout-escape-result.txt`, `checkout-escape.png`; A16/A24 | Explicit approval; focus-managed dialog; user control | `ApprovalRequestItem.tsx:82,144,175` | D03 canOpen ≠ autoOpen | S4; Escape conserva CTA/foco |
| F06 | P1, recovery B-S+I | `recovery-result.txt`, `save-error.png`; A18 | Honest canonical save; recoverable errors, idempotency | `useClinicalAssistant.ts:856–862`; artifact terminal failed | D04 reconciliar antes de repetir | S5; transitorio/ambigüedad/expiración distinguibles |
| F07 | P2, mejora O sobre conducta B-S | `clinical-matrix-result.txt`, `stop-queue.png`; A09 | Queue supports ongoing conversation | Label/feedback composer y cola | D05 alcance de Stop | S7; copy claro, semántica no cambiada |
| F08 | P2, recuperación incompleta B-S | `clinical-matrix-result.txt`; A10 | Context mismatch must not silently dispatch | `ClinicalAssistantArea.tsx:638–653`, truthy patientId | D01/D05 recuperar null | S6; acción segura sin rebind |
| F09 | P2, diseño O | `chat-360.png`, `empty-1440.png`; A02/A24 | Quiet clinical hierarchy, one primary action | Header/starters/entradas Pendientes | D06 compactar sin ocultar seguridad | S7; comparación visual y teclado |
| F10 | P2, contrato interno B-C | `coarse-touch.json`; A24 | Surface brief coarse targets 44px | Variants/selectors de controles 40px | D06 targets accesibles | S7; medir coarse en cinco tamaños |

**B-C** navegador checkout compilado; **B-S** navegador servido no hash-parity; **I** inferido; **O** opcional. El soporte T de 70 tests es transversal, no una regresión dedicada de estos bugs.

## Contratos autorizantes y precedencia

| Documento | Uso en esta auditoría | Decisión que no se permite revertir |
|---|---|---|
| `PRODUCT.md` | Persona, consulta, aprobación | AI redacta; humano decide |
| `DESIGN.md` | Lenguaje visual incumbent | No tema/sistema visual nuevo |
| `docs/design/UX_PRINCIPLES.md` | Contexto, recuperación, conservación | No pérdida silenciosa ni guardado implícito |
| `.impeccable/surfaces/clinical-assistant.md` | Jerarquía, responsive, motion, targets | Mantener artefacto inline y Drive secundario |
| `openspec/specs/conversational-runtime/spec.md` | Runtime, stream, cola, persistencia | Ownership de hilo/turno y reconciliación |
| `openspec/specs/clinical-agentic-feedback/spec.md` | Feedback y approval | Actuar conforme estado clínico |
| `openspec/specs/patient-dental-evolutions/spec.md` | Registro clínico | Save solo aprobado y owner-scoped |
| `openspec/specs/google-drive-managed-workspace/spec.md` | Drive/journals | Notas globales, documentos por paciente, diarios; failed ≠ unknown |
| Archive `2026-09-14-unify-drive-clinical-artifact-loop/design.md` | Rationale histórico | Canonical PostgreSQL + export intent; un artefacto, no receipt duplicado |
| Audit Pacientes `2026-10-08` | Compatibilidad entre superficies | D04: no referencias visuales a planes en Pacientes |
| `AGENTS.md`, frontend architecture | Placement, primitives, validation | SQL en db, clients tipados, dependencias hacia abajo |

Este audit es propuesta, no nueva autoridad que sustituya esos contratos.

## Evidencia → límites de afirmación

| Evidencia | Afirmación permitida | Afirmación no permitida |
|---|---|---|
| Fixtures browser | UI reaccionó a payload/stream sintético | Backend y proveedores reales pasaron E2E |
| Checkout interception | Bug reproducido con checkout JS en navegador | Container backend corresponde a ese commit |
| CSS hash común | CSS generado igual | JS/DB/modelo iguales |
| `focused-vitest.txt` | 70 pruebas existentes pasaron | F01–F06 poseen tests de regresión nuevos |
| `detector.json` vacío | Detector no emitió resultados | WCAG, security o UX sin fallos |
| `transport-result.txt` | GET recuperó respuesta fixture | Restart durability server garantizada |
| `session401-result.txt` | Navigation de reauth ocurrió con auth mock | Sesión real expirada recupera draft |
| `coarse-touch.json` | Targets concretos 40px con coarse=true | Violación automática WCAG 2.5.8 |

## Decisiones pendientes → validación

| Decisión | Responsable humano requerido | Evidencia faltante / gate |
|---|---|---|
| D01 material global vs paciente | Producto + clínica | Usability de cambio A/B/null; no transferencia accidental |
| D02 identidad histórica disponible | Backend + frontend | Payload owner-scoped y tests dos usuarios si cambia query |
| D03 buffers solo memoria o durable | Producto + seguridad | Privacidad, retención, logout/shared-device policy |
| Recovery save | Backend + clínica | 5xx antes/después commit, expiry, hash y idempotency tests |
| Stop vs Pausar cola | Producto | Necesidad real; copy-first vs nuevo control |
| UAT con writes | Dueño del entorno | Autorización de pacientes/TXT sintéticos y limpieza |
| Density P2 | Producto/design | Compare incumbent en cinco tamaños después de corregir P1 |

Cobertura por escenario y gaps detallados en [08](08_ASSISTANT_E2E_COVERAGE.md).
