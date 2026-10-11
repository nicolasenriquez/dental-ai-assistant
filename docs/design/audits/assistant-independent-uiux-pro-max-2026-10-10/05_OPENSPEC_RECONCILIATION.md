# Reconciliación posterior al freeze

Autoridades consultadas después de guardar la evaluación independiente: PRODUCT.md, DESIGN.md, UX_PRINCIPLES, brief de clinical-assistant, auditoría Impeccable y Emil del 2026-10-10, matriz R01–R11, proposal/design/tasks y tres delta specs de `refine-clinical-assistant-ux`. También se buscaron contratos de las tres capacidades principales. El freeze SHA256 de 01/02/04 se conserva en `evidence/independent-freeze.json`.

## Entregas originales

| Entrega | Alcance | Relación con este recorrido |
| --- | --- | --- |
| C0 | Continuidad externa y procedencia source/build/served | Sigue siendo gate; este recorrido no demostró igualdad del bundle con HEAD |
| C1 | Ancho útil de escritura y controles | No se repite la incidencia contextual R03 como finding nuevo |
| C2 | Decisión segura de contexto y origen retenido | No se confunde foco correcto del picker con foco del futuro modal |
| C3 | Carga, errores por operación y recovery fuera de vista | Vacío/error de pendientes no prueba corrección del fallo de hilo R11 |
| C4 | Ventana paginada de pendientes, foco y reconciliación | Solo vacío/error probados; paginación y retry quedan sin verificar |
| C5 | Headings de artefactos, fecha/hora, navegación disponible | La precisión a minutos no cubre por sí sola destinos de igual minuto |
| C6 | DE01 altura visible, DE02 modal bounded, DE03 nombres de fuentes | No se duplican DE01 con nombre largo ni DE03 con nombre de conversación |
| Integrated | Suites, browser, AT, dispositivos y smoke | Gates originales se mantienen abiertos y no se satisfacen con esta auditoría |

## Clasificación

| Hallazgo | Clase | Justificación / decisión |
| --- | --- | --- |
| PMAX-001, identidad en resultado con fecha coincidente | VALID ADDITIVE GAP, pequeño dentro de C5 | El escenario R09 distingue horas diferentes; el resultado consultado usa solo fecha/minuto y IDs diferentes pueden tener igual presentación. Añadir aceptación para distinguir los enlaces dentro del resultado, sin preview, API ni SSE nuevos. |
| PMAX-001, resúmenes para comparar clínicamente | OUT OF SCOPE | El backend elimina el contenido del payload. No se propone recuperarlo mediante nuevas lecturas o contrato. Futura mejora independiente. |
| PMAX-002 | NOT VERIFIED para ampliación | La indistinguibilidad se reprodujo, pero falta determinar una pista autorizada que no exponga contenido clínico. Un preview existente en API no basta para autorizar mostrarlo en sidebar. No añadir tarea. |
| PMAX-003 | OUT OF SCOPE | Defecto reproducido en shell/aviso de onboarding compartido. No corresponde convertir una spec del Asistente en un cambio global del shell por conveniencia. Backlog separado. |
| PMAX-004 | ALREADY SPECIFIED | DE01 ya exige identidad larga, altura útil, scroll deliberado y composer alcanzable. La compactación es opcional; esta captura no demuestra un nuevo fallo de acceso. Mantener como fixture futura de C6. |
| PMAX-005 | OUT OF SCOPE / OPTIONAL | Densidad de filtros de Patients; no es fallo funcional ni parte del Asistente. Evaluar con usuarios antes de abrir una spec de Patients. |

No se declara ningún finding nuevo ALREADY IMPLEMENTED: las fortalezas corresponden a comportamiento correcto, no a defectos arreglados durante este trabajo. No se marca ningún requisito pendiente como ausente.

## Comparación con revisiones anteriores

R09 ya abordaba fechas sin hora; PMAX-001 aporta una colisión reproducida aun mostrando hora y minuto, y un renderer de lista distinto del artefacto. No se encontró aceptación explícita para ese caso en los artefactos revisados. PMAX-003 aporta evidencia geométrica del aviso desconectado, fuera del alcance de esta spec. PMAX-002 queda candidato pendiente de decisión de privacidad. PMAX-004 no justifica nueva entrega.

La auditoría sí encontró oportunidades útiles no explicitadas en la documentación revisada. No establece que ninguna revisión anterior del proyecto, fuera de las fuentes consultadas, haya ignorado esos problemas. Tampoco demuestra prevalencia o impacto clínico real de las colisiones sintéticas.
