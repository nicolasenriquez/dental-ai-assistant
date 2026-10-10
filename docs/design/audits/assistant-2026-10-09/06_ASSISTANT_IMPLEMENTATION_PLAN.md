# Plan por slices, pendiente de autorización

2026-10-09 · Basado en [auditoría](02_ASSISTANT_TECHNICAL_AUDIT.md) y [Shape](05_ASSISTANT_UX_SHAPE_PROPOSAL.md).

No se ejecutó ninguno de los slices. Los tests nuevos descritos son requisitos futuros, no pruebas ya agregadas.

## Dependencias y orden

```text
G0: confirmar checkout/paridad, fixture safety y decisiones
 ├─ S1: async Stop scoped ──────────────────────────────┐
 ├─ S2: buffers de edición dirty ──┐                   │
 ├─ S3: paciente histórico ────────┼─ S6: cambio contexto/cola
 ├─ S4: revisión reabrible ────────┤                   │
 └─ S5: save/reconciliación segura ┘                   │
                                   S7: claridad/densidad/targets
                                                      │
                                      G1 integración sintética
                                      G2 UAT autorizado + mobile/a11y
```

S1/S4/S5 comparten hook clínico en alguna medida; no asignarlos a agentes que escriben el mismo archivo simultáneamente. S2/S3 pueden investigarse en paralelo con contratos fijados, pero se integran serialmente si ambos tocan artifact/transcript. Una PR por problema; no aprovechar para migrar CSS o reescribir runtime.

## G0. Evidencia y decisiones

- Reproducir F02/F03/F06 con checkout compilado o servicio reconstruido **con autorización aparte**; no asumir que bundle local equivale a Git.
- Confirmar D01: notas globales vs material ligado a paciente; D02: paciente histórico disponible; D03: memoria local vs durabilidad a recarga.
- Preparar tests sintéticos que no puedan caer a APIs reales.
- Definir recovery de guardado con backend existente y revisión humana de paths sensibles.
- Gate: repro estable para cada issue y contrato de aceptación escrito.

## S1. Scope de Stop y callbacks tardíos · P1 · F01

**Archivos probables:** `src/hooks/useClinicalAssistant.ts`, tests del hook; navegador synthetic cancel-race.

**Cambio mínimo:** capturar thread/turn/controller originarios; identidad/generation guard en callbacks de éxito/error; cleanup no toca controller de otro hilo. Revisar callbacks vecinos con mismo patrón sin ampliar refactor.

**Regresión:** diferir cancel A; abrir B e iniciar B; resolver A. B sigue visible y no abortado. Variante error A; doble Stop; unmount; cancel de turno persistido A que no cambia B.

**Gate:** hook tests + headed checkout race + no regresión reconcile/queue. Rollback: revert PR; sin migración.

## S2. Buffers editables participan del dirty-transition · P1 · F04

**Archivos:** `EvolutionReviewArtifact`, runtime/draft memory y guard existente; consumidores contextual/global.

**Cambio:** preservar edición por artefacto/campo o impedir salida sin decisión. Un único propietario de buffer; no autoaprobar ni sincronizar un valor no Aplicado como evolución canónica. Aplicar/cancelar tienen semántica explícita.

**Regresión:** campo editado → Pendientes/ficha/otro hilo → volver; Aplicar y Cancelar; nota fuente; autosave en curso; navegación durante persistencia; refresh conserva solamente lo que el contrato promete. No duplicar guard por cada componente.

**Gate:** pérdidas silenciosas ausentes; foco recuperado; draft/hashes no rotos. Rollback: revert; advertir si buffer frontend nuevo se perdería al reload.

## S3. Paciente histórico del artefacto · P1 · F03

**Archivos:** `ClinicalTranscript`, `ClinicalEvolutionArtifact`; types/hidratación solo si faltan datos.

**Cambio:** resolver metadata desde identidad histórica owner-scoped. No vincular artefacto al paciente actual por conveniencia. Si datos faltan, investigar API existente y proponer delta antes de editar contrato.

**Regresión:** artefacto A + paciente workspace B/null; aprobación/saved hidratan A; nombre largo/identificador enmascarado; dos usuarios (backend test si se amplía query).

**Gate:** no fugas de paciente, no API IDs crudos visibles, review muestra destino correcto. Si hay SQL nuevo, solo `db/`; si schema cambia, nueva migration y revisión específica (no anticipada por este plan).

## S4. Revisión sigue operable al cerrar diálogo · P1 · F05

**Archivos:** `ApprovalRequestItem`, `ClinicalEvolutionArtifact` y tests correspondientes.

**Cambio:** separar política initial autoOpen de triggers permanentes; cerrar vuelve a review con Confirmar/Seguir editando. Foco a trigger estable; no loops de reopen ni dialog duplicado.

**Regresión:** Escape, botón cerrar, seguir editando, vuelta atrás, hidratación, mouse/keyboard, focus-return, committing protegido.

**Gate:** cero callejones; cerrar no aprueba/descarta; screen-reader/manual checks antes de release. No cambiar primitive sin necesidad demostrada.

## S5. Recuperación de guardado conforme estado canónico · P1 · F06

**Archivos:** `useClinicalAssistant`, artifact/approval UI, typed clients si contrato lo requiere; backend resolve tests sin cambiar invariantes.

**Cambio:** separar `ACTION_EXPIRED`, fallo conocido y resultado incierto. Reconciliar aprobación/evolución antes de repetir una escritura. Volver a revisión o preparar nueva confirmación cuando backend lo permita, con draft preservado.

**Regresión:** POST falló antes de guardar; POST guardó pero conexión cayó; pendiente válida; expiración real; hash obsoleto; double-click; two tabs; autosave pendiente; save exitoso + export failed/unknown.

**Gate:** una evolución canónica por aprobación idempotente; ninguna aprobación automática; ninguna copia ciega en Drive. Code review humana de backend/security si se toca resolve. Rollback de UI no cambia export intent ya persistido.

## S6. Transiciones de paciente y recuperación de cola · P1/P2 · F02/F08

**Dependencias:** decisión D01, S2 y S3.

**Archivos:** `ClinicalAssistantArea`, composer/queue/memory; active patient endpoint solo si hace falta atomicidad aprobada.

**Cambio:** una política contextual para texto, adjuntos, cola y buffers. Volver a sin paciente tiene una vía directa segura; no rebind automático. Voice guard existente intacto.

**Regresión:** paciente A→B/null con texto/adjunto/cola; null→A; cancelar transición; descarte explícito; conservar contexto anterior; cambio durante voz/stream/save; draft de otro hilo no afecta actual.

**Gate:** decisiones claras, conservación de trabajo, nunca envío con contexto no elegido. Backend owner checks sin relajación.

## S7. Claridad, targets y densidad · P2 · F07/F09/F10

**Dependencias:** gates funcionales anteriores. Puede subdividirse en PR de targets y PR de copy/density.

**Cambio:** alcance de Stop y cola explícito; ayuda de teclado compacta; coarse targets 44px; starters contextuales; menos repetición de Pending. Reusar Button/patterns/tokens existentes.

**Regresión visual:** 1440×900, 1024×768, 768×1024, 390×844, 360×800; long patient name/text; queue full; drive open; artifact review/saved; reduced motion; keyboard. No root overflow ni composer escondido.

**Gate:** surface brief actualizado si se adopta decisión durable local; `DESIGN.md` solo para decisión transversal. No planes en Pacientes.

## Gates generales

1. **Por slice:** test RED que reproduce → cambio mínimo → GREEN → revisión de blast radius → headed checkout probe.
2. **Integración:** A01–A24 con fixtures; races/dirty transitions; no caída silenciosa a backend real; traceability actualizada.
3. **Validación repo antes de commit:** backend `uv run ruff check .`, `ruff format --check .`, `mypy .`, `pytest tests -xvs`; frontend `bun run tsc --noEmit`, `bun x biome check src`, `bun run test`. Ejecutar desde directorios de AGENTS. Documentar fallos previos sin ocultarlos.
4. **UAT:** base aislada, dos usuarios sintéticos, pacientes y TXT desechables; aprobación/save/Drive retry/unknown/conflicto reales. Pedir consentimiento de escritura. No usar cuenta personal por defecto.
5. **Accesibilidad:** teclado, foco, dialogs/landmarks/live regions, contraste medido y screen reader. Targets coarse y zoom/reflow reales. No llamar a un detector vacío «WCAG pass».
6. **Mobile real:** teclado virtual, safe area, selección/dictado, compositor, scroll del sheet y orientación.
7. **Rendimiento:** medir LCP/INP/CLS y flame/long tasks antes de proponer virtualización. Baseline y presupuesto acordados, sin perf claims retrospectivos.

## Riesgos diferidos

Buffers ante recarga/reautenticación (privacidad); proceso servidor reiniciado (durabilidad); export worker capacity/lock contention; reader Drive conflict y unknown; historical artifact collapse. No se mezclan con la corrección P1 salvo que impidan cumplir un criterio ya aprobado.

**Autorización necesaria:** aprobar primero alcance/decisiones y el slice inicial. Este documento no concede autorización de implementación o datos.
