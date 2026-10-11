# Auditoría independiente del Asistente

2026-10-10, America/Santiago. Rama `feat/ai-assisted-evolutions`, HEAD `4957faf3ca38079ac0745f0b234e8ef9bd69b5ad`.

Score del alcance recorrido: **71/100**. Se encontraron cinco oportunidades respaldadas por observación; ninguna P0/P1 confirmada. El score no incluye aprobación, persistencia ni accesibilidad completa.

La auditoría aporta una brecha pequeña de aceptación a C5: la fecha con hora/minuto no distingue evoluciones de IDs diferentes que comparten el mismo minuto. Se añade un escenario y task 5.5 para identificarlas localmente, sin nuevos datos clínicos, requests ni cambios de SSE. No se crea C7. El problema de banner/navegación móvil queda fuera de esta spec; la identidad larga ya está en DE01. No se realizaron cambios de aplicación.

## Documentos

- [Inventario y seguridad](01_BROWSER_SURFACE_INVENTORY.md)
- [Evaluación independiente congelada](02_INDEPENDENT_UX_AUDIT.md)
- [Investigación UI/UX Pro Max](03_UI_UX_PRO_MAX_RESEARCH.md)
- [Matriz de hallazgos congelada](04_FINDINGS_MATRIX.md)
- [Reconciliación OpenSpec](05_OPENSPEC_RECONCILIATION.md)
- [Decisión, grafo y backlog futuro](06_ADDITIVE_REFINEMENT_DECISION.md)
- [Evidencia y reproducción](evidence/README.md)

## Resultados que merecen atención

| Hallazgo | Resultado |
| --- | --- |
| PMAX-001 P2, enlaces idénticos de evoluciones coincidentes | Escenario aditivo C5; comparación clínica con previews queda fuera |
| PMAX-002 P2, hilos genéricos indistinguibles | Candidato observado; solución segura NOT VERIFIED, no ampliar spec |
| PMAX-003 P2, menú sobre el aviso de Drive | Backlog separado del shell compartido |
| PMAX-004 P2, encabezado con identidad larga | Ya especificado DE01; no duplicar |
| PMAX-005 P3, filtros ocupan mucho espacio móvil | Futuro Patients; opcional, sin defecto funcional confirmado |

Fortalezas: tabla desktop y filas móviles de Patients; enlaces a evolución exacta; Escape y retorno de foco en picker/Drive; error distinto de vacío en pendientes; ausencia de overflow global en las capturas estables. No se recomienda rediseño, nueva paleta, librerías ni animaciones adicionales.

## Respuesta ejecutiva

Sí, se encontraron oportunidades no explicitadas en las fuentes anteriores revisadas. La ampliación que merece esta OpenSpec es solo la identificación de enlaces coincidentes. Su beneficio es modesto y verificable; no sustituye la consulta de contenido clínico. El solapamiento del banner necesita una futura mejora del shell; el historial requiere revisar privacidad; filtros de Patients y previews deben tener su propio alcance. C1–C6 siguen siendo la prioridad principal del cambio.

## Validación y límites

Se validó `openspec validate refine-clinical-assistant-ux --strict` y se comprobaron requirements/escenarios originales, IDs y estados de tareas, DAG, freeze y cambios de archivos. Resultados en `evidence/openspec-validation.txt` y `evidence/document-validation.json`. Esta validación es documental. No ejecuta ni cierra las tareas de implementación.

La observación nativa fue acotada y sin capturas persistidas con datos clínicos. La mayor parte de la evidencia procede de Playwright CLI aislado con APIs interceptadas. No se probó paridad del bundle con HEAD, dispositivo físico, lector de pantalla, zoom real 200%, aprobación, guardado, dictado ni exportación. Un intento de Diagnóstico con fixture incompleta se excluye expresamente. No hubo commit, sync, archive, deploy ni cambios en tests de aplicación.
