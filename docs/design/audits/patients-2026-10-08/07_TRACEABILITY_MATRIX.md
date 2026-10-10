# Matriz de trazabilidad

IDs estables para seguimiento. Estado actual se define en [auditoría](02_TECHNICAL_UX_AUDIT.md), propuesta en [Shape](05_UX_SHAPE_PROPOSAL.md), alcance en [plan](06_IMPLEMENTATION_PLAN.md). Los tests T01-T12 son aceptación futura; no existen todavía como suite nueva.

| Finding / prioridad | Evidencia | Causa raíz | Vistas afectadas | Propuesta | Slice | Test observable |
|---|---|---|---|---|---|---|
| F01 P1, confirmado fixture | performed-fixture.png; TreatmentRecordModal:41,107; PatientDiagnosis:1969-1992 | Estado reducido a existing/other y capability confundida con label | Chart, lista, inspección, detalle, arcada | Mapping exhaustivo + capability independiente | S1 | T01 performed=Realizado en todas vistas; no write al consultar |
| F02 P1, confirmado real | outside→BODY→Escape mantiene dialog; DentalConditionModal:43-80 | Escape/Tab solo dentro de panel; backdrop no recupera foco | Surface, scope, record modals | Lifecycle modal con foco/cierre/guard | S2 | T02 fuera→Escape cierra/cancela correctamente y retorna foco |
| F03 P1, confirmado real | Activity→26→Cerrar→Escape conserva pressed; PatientDiagnosis:1178-1183 | focused history reutiliza selectedTooth | Odontograma, detalle, Activity deep link | Referencia histórica distinta de selección operativa | S2 | T03 cerrar consulta sin pressed operativo; historia conservada |
| F04 P2, estático | useDentalWorkspace:289-300; PatientDiagnosis:1011-1039 | Range anchor reset solo por modo/tool o completar rango | Puente/multi-pieza | Clear members conservando herramienta | S2 | T04 primer extremo→clear→rango nuevo, cero write |
| F05 P2, confirmado visual | catalog-390/768/1440; API 29 restauradoras | Todas variantes se renderizan como tarjetas grandes | Catálogo y recorrido a registros | Filtro contextual/lista compacta | S4 | T05 63 variantes localizables, orden estable, sin pérdida de ids |
| F06 P2, confirmado visual/estático | PatientDiagnosis:1207-1233 | Mismo button variant y lenguaje pressed para categoría/tool | Categorías y acciones | Selector categoría subordinado y tool activo claro | S4 | T06 category solo navega; tool armada no escribe |
| F07 P2, confirmado real | activity-existing.png; PatientActivity:14-21,51-52 | Retiro de authoring conservó filtros históricos sin calificación | Activity y lectura planes | Histórico explícito, notas vigentes preservadas | S3 | T07 eventos/link legacy accesibles, sin plan authoring |
| F08 P2, estático/catalog | DentalLegend:67-74; ocho crown variants API | .find primera variante usado como descripción del concepto | Leyenda/catalog/observaciones | Leyenda por concepto y variante contextual | S4 | T08 zirconio no descrita como metal-cerámica, leyenda compacta |
| F09 P2, real + estático | patient_activity.py:114; PatientDetail:407-415 | Query construída/limpiada con reglas diferentes | Activity, diagnóstico, evolución, plan | Canonicalización acotada | S3 | T09 modo explícito; sin plan residual; reload/back restauran destino |
| F10 P2, estático | clinical_notes_repo:255-264; api:1451-1457; PatientDentalNoteDetail:87 | Metadata perdida en contrato y render | Historial nota dental | Actor declarado o fallback confiable | S5 | T10 nombre disponible igual en Activity/history; null no inventa autor |
| F11 P2, estático | patient_activity_repo:24-27; evolución sin actor en schema base | Proyección NULL y falta de semántica durable actor/owner | Evoluciones y Activity | Provenance confiable o campo nuevo nullable | S6 condicional | T11 autor nuevo trazable; legacy desconocido intacto |
| F12 P2, estático | PatientDentalNoteDetail:44-56; PatientClinicalPlanHistory:26-55 | Fetch/render sin foco de destino | Activity→nota/plan | Foco una vez por target y anuncio | S3/S5 | T12 keyboard llega al recurso; paginación no roba foco |

## Propuestas opcionales y decisiones

| ID | Clasificación | Evidencia | Gate |
|---|---|---|---|
| O01 | Mejora opcional | scroll chart intencional + cuadrantes en PatientOdontogram:158-161,415-459 | Comprensión anatómica y eficiencia antes de cambiar vista inicial |
| O02 | Mejora opcional, solapamiento visual confirmado | Notas flotante sobre tarjeta en catalog-390.png | Medir target/focus, no afirmar bloqueo funcional antes de reproducción |
| H01 | Política pendiente | commands de planes existentes todavía declarados, patient_treatment_plans:65-226 | Producto define retiro UI vs freeze API, luego inventario de consumidores |
| H02 | Validación pendiente, no defecto afirmado | commands transaccionales + refresh local | PostgreSQL aislado corrección/replacement/múltiples vistas y response loss |

## Evidencia positiva que no debe regredir

| ID | Garantía | Evidencia | Gate |
|---|---|---|---|
| G01 | Inspección ordinary sí puede cerrarse | Cerrar pieza/Escape, popover y botón en PatientDiagnosis:2129-2137 | T02/T03 |
| G02 | Tooltip/tool/hover no escribe | chooseTool/chooseTooth:579-625; suite 71 tests | T06 + requests count |
| G03 | Error/partial read no es total confirmado | GET503→retry real; tests paginación | S7 |
| G04 | Corrección conserva original/revisión/receipt | patient_conditions_repo:300-381; treatment commands | S1/S7 DB |
| G05 | Notes rail/Sheet comparten draft | DentalClinicalNotes + hook; tests de guards | S5/S7 |
| G06 | Activity no es storage rival | patient_activity_repo UNION readonly repeatable_read | S3/S7 |
| G07 | FDI anatómico correcto | toothGeometry:3-11; arcadas reales | S4/S7, no sort ascendente del gráfico |
| G08 | Ownership y FK compuestas | migrations0025-0028 + owned queries | S7 HTTP y DB |

## Checklist del encargo

| Criterio | Estado |
|---|---|
| Flujo Pacientes completo inventariado | Sí; directorio/ficha/cuatro secciones/evoluciones/assistant boundary. No UAT de todas las escrituras. |
| Legacy investigado | Sí; authoring retirado vs filtros/enlaces históricos y APIs existentes. |
| UI vs datos clínicos diferenciados | Sí; inventario y rollback sin borrado. |
| Dientes/superficies/selección/deselección | Sí; ordinary, repeated activation, histórico, cancel, fuera/Escape; multi-pieza static+tests. |
| Editar/eliminar/descartar | Código/tests revisados; borrador general descartado real; nuevas persistencias clínicas no ejecutadas. |
| Diálogos relevantes | Surface/inspection/record/scope/notes/guards investigados; scope y delete requieren UAT dedicado. |
| Jerarquía/scrolling/categorías | Sí; ocho categorías, 63 variantes, 29 restauradoras y screenshots en tres tamaños. |
| Numeración FDI | Sí; permanente y temporal code; disposición frontal preservada. |
| Consistencia frontend/backend | Sí; mapa y estados, receipts, actor, ownership/FKs/transacciones. DB concurrencia no ejecutada. |
| DentalPin contrastado | Sí; checkout fc36a71b y tres documentos distinguidos de implementación actual. |
| Critique/Audit/Shape instalados | Sí; playbooks locales. Critique CLI/browser propios, sin overlay; Shape pendiente confirmación. |
| Recomendaciones con evidencia | Sí; cada F enlaza source/probe y test futuro. Opcionales/H separados. |
| Arquitectura/sistema visual preservados | Sí en propuesta; sin nueva state library/UI library/provider. |
| Código productivo sin cambios | Sí; solo carpeta de informes/capturas. Verificación final git diff fuera de carpeta vacía. |

No marcar cobertura parcial como completa por haber escrito un plan. Release requiere los gates explícitos de S7.
