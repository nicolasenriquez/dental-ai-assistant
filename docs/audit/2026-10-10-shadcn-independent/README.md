# Auditoría independiente con shadcn

10 de octubre de 2026, America/Santiago. Auditoría y especificación; sin implementación.

Valoración del alcance observado: **7,2/10**. La identidad enmascarada, la recuperación del texto al cerrar el Sheet y el retorno de foco en Drive funcionan en los recorridos probados. La composición contextual repite títulos y no respeta el ancho previsto para tablet. El build servido muestra una transición problemática de contexto, pero sus assets difieren de los del `dist` local: no se atribuye ese comportamiento al código actual.

Se registraron cinco hallazgos independientes: dos brechas nuevas de aceptación y tres observaciones relacionadas con hallazgos anteriores. Tres están cubiertos por OpenSpec; dos necesitan aceptación adicional. No hay hallazgos aceptados fuera de alcance. Dos posibles defectos visuales se descartaron por evidencia transitoria o inconsistente.

## Entrega

- [Auditoría y cobertura](01_INDEPENDENT_UX_UI_AUDIT.md)
- [Componentes y referencias shadcn](02_SHADCN_COMPONENT_REVIEW.md)
- [Reconciliación histórica](03_AUDIT_RECONCILIATION.md)
- [Brechas OpenSpec](04_OPENSPEC_GAP_ANALYSIS.md)
- [Aceptación y secuencia propuestas](05_PROPOSED_SPEC_ADDITIONS.md)
- [Índice de evidencia](evidence/README.md)

Se visitaron Patients, ficha sintética, Asistente completo, Asistente contextual, Pendientes y las tres secciones de Drive con el navegador nativo de Codex y su API Playwright. Matriz nominal: 1440×900, 768×1024 y 390×844; también 1025×768. Los tamaños efectivos y los límites de las capturas se explican en 01 y en el índice. No se enviaron turnos, aprobaron evoluciones ni reintentaron exportaciones. Abrir el Asistente y seleccionar/quitar contexto sí puede actualizar metadatos del hilo mediante el flujo existente. El texto sintético se limpió.

## Cinco prioridades

| Prioridad | Problema y efecto | Cambio mínimo / patrón | Evidencia | Estado de planificación |
|---|---|---|---|---|
| P1 | Texto clínico sin enviar aparece como consulta general tras quitar paciente en el build servido | C2 existente: decisión AlertDialog y origen retenido, sin cambiar política | 17-context-change-with-unsent.jpg | Ya cubierto; verificar tras C0 |
| P1 gate | Assets servidos y locales diferentes impiden atribuir resultados a HEAD | C0 existente: manifest y evidencia del mismo build | provenance.json | Ya cubierto |
| P2 | Sheet contextual mide 460 px frente a 560 px previstos; pierde 100 px disponibles | Reutilizar SheetContent con ancho local, sin alterar Drive | 16-contextual-tablet.jpg y geometría JSON | Requisito nuevo; tarea 1.4 |
| P2 | Título contextual duplicado y tres h2 compiten por la misma sección | Un SheetTitle/h2 contextual; empty state h3 | 15-contextual-1025-native-full.jpg, 16-contextual-tablet.jpg | Requisito nuevo; tarea 5.6 |
| P3 | Pendientes repetido cuando la sidebar ya lo ofrece | C5 existente: disponibilidad visible, conservar acceso en rail/móvil | 01-assistant-desktop.jpg; snapshot de navegación en observaciones | Ya cubierto |

OpenSpec modificado: `proposal.md`, `design.md`, `tasks.md`, `specs/conversational-runtime/spec.md` y `specs/clinical-agentic-feedback/spec.md`, todos bajo `openspec/changes/refine-clinical-assistant-ux/`. Se añadieron dos requisitos, cinco escenarios y dos tareas sin marcar. No se reescribieron tareas ni se cambiaron estados. Validación estricta y conservación de contenido en `evidence/document-validation.json` y `evidence/openspec-validation.txt`.

La especificación ahora recoge las dos brechas observadas y es apta para una implementación posterior condicionada a C0. No constituye una certificación visual completa ni cierra gates de dispositivos, lectores de pantalla, proveedores o persistencia. Primero resolver procedencia; después C1/C2, C3/C4 y C5 con sus nuevas comprobaciones; luego C6/C7 y verificación integrada. Evitar migraciones de librería, nueva paleta, componentes fuera de la allowlist y cambios basados en capturas transitorias.
