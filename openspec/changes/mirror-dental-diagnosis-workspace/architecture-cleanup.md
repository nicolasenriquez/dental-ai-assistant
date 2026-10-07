# Arquitectura y retirada segura del flujo anterior

Ejecución de Slice10 (2026-10-07): el inventario definitivo, las retiradas y las pruebas
antes/después/rollback están en [slice10-evidence.md](slice10-evidence.md). El diagnóstico
estructural siguiente conserva el estado auditado original; no describe el código actual.

Contrato de esta OpenSpec, no implementación realizada. La arquitectura del target sigue AGENTS.md; no incorpora el registro modular de Vue, SQLAlchemy, un bus de eventos ni un contenedor de inyección de DentalPin. Aquí inversión de dependencias significa aceptar dependencias en el Seam que realmente varía, con Adapter de transporte/persistencia y pruebas, sin inventar interfaces para cada función.

## Diagnóstico estructural

`app/frontend/src/components/patients/PatientDiagnosis.tsx` tiene 1637 líneas en el estado auditado. Concentra catálogo, borrador, selección, recuperación, peticiones, paginación y presentación. El tamaño es evidencia de concentración, no una métrica de Depth. `chooseTooth` desplaza foco mediante `firstSurfaceRef`; `pieceButtonRef` y `toothSelectRef` sostienen el recorrido inferior «Cambiar pieza». Mantener ese recorrido junto al mirror produciría dos propietarios de la misma interacción.

El consumidor público es `pages/PatientDetail.tsx` → `PatientDiagnosis`; los tests renderizados cruzan ese mismo Seam. `PatientOdontogram` y `ToothDrawing` consumen `toothGeometry`; `PatientDiagnosis`, `PatientOdontogram` y `PatientConditionHistory` consumen `lib/odontogramPresentation`. Este último también conserva resolución de códigos históricos: no puede borrarse en bloque como supuesto legacy.

En DentalPin, `DiagnosisMode.vue` compone chart/lista/CTA y pasa contexto al sidebar; `OdontogramChart.vue` orquesta selección/aplicación; `ToothDualView.vue` consume geometría/reglas; `DiagnosisNotesSidebar.vue` y `NoteComposer.vue` poseen feed y borrador. Replicar estas responsabilidades no exige replicar su infraestructura de ModuleSlot.

## Modules y pequeñas Interfaces

| Module y ubicación | Interface para caller y tests | Implementation oculta / propietario |
|---|---|---|
| Workspace dental, `hooks/useDentalWorkspace.ts` | patientId, mode, selectedPlanId; viewModel y eventos tipados de intención/inspección/aplicación/edición/recuperación | catálogo normalizado, active variant, dentición, selección anatómica, operación congelada, carga/refresh coordinado y adaptación de condición/procedimiento. UI no conoce orden de peticiones ni arma payloads. |
| Presentación dental, evolucionar `lib/odontogramPresentation.ts` y geometría del dominio | construir modelo de pieza y de tarjeta/leyenda desde registros y catálogo; datos anatómicos puros | un registro de tipos/variantes y reglas de capa, aliases históricos, anchors, colores y estados. Chart/paleta/leyenda no mantienen switches clínicos rivales. `resolveCondition` usado por historial se conserva o migra con su consumidor. |
| Notas clínicas, `hooks/useDentalClinicalNotes.ts` | contexto autorizado patient/entity, candidato de pieza; modelo de compositor/feed y acciones texto/plantilla/asociación/guardar/editar/eliminar/paginar | cuerpo y asociación capturada, body-only edit, draft/retry, cursor y refresh. Una instancia conserva el borrador cuando cambia rail/Sheet; candidatos y highlights son entradas separadas, sin estado global compartido. |
| Plan clínico, `hooks/usePatientClinicalPlan.ts` y dominio backend de planes | snapshot autorizado + comandos explícitos del ciclo y sus recibos | aggregate/revision, orden de items/sesiones, estados permitidos, historial, recuperación y completado automático. No duplicar transiciones en la página y el hook. |
| Dominio backend paciente, servicios para tratamientos/planes/notas | comandos tipados con owner autenticado, operación/revisión y resultado de dominio | validación clínica, identidad, autorizaciones, invariantes y coordinación transaccional; recibe acceso al repositorio/transaction Adapter. El Adapter asyncpg ejecuta SQL en `db/`; las pruebas HTTP observan los mismos resultados y real Postgres demuestra locks/rollback. |

Los nombres propuestos fijan ownership, no obligan a introducir clases. Cada Module presenta una Interface coherente; sus helpers privados pueden dividirse por responsabilidad. No crear un hook por endpoint que solo reenvíe fetch, un comando genérico sin tipos, un barrel de exports de todo el dominio ni un hook universal que incluya notas, planes, dibujos y peticiones. Los typed clients actuales son el Seam de transporte del frontend; no añadir una capa paralela de cliente. Inyectar allí solo lo necesario para usar el Adapter real y el de pruebas. No sustituir pruebas transaccionales por mocks.

PatientDiagnosis queda como composición del modelo dental, chart/paleta/lista/CTA y notas. Componentes renderizan y emiten eventos; no hacen fetch, SQL, retries ni resuelven transiciones. El catálogo y las reglas visuales comparten identidad de variante pero mantienen separado permiso de entrada de convención gráfica. La validación definitiva sigue en servidor; un icono no define superficies válidas.

## Expand → migrate → contract

1. Expand: storage aditivo y Modules nuevos detrás de las Interfaces existentes. Conservar condiciones/notas generales, UUIDs, revisiones, correcciones y deep links. No transformar datos históricos para que parezcan nuevos registros.
2. Migrate: Slice1 cambia inspección/aplicación; Slice2/3 añade variantes y scopes; Slice4–6 planes; Slice7 presentación; Slice9 notas; Slice8 integra el caller público. Cada slice migra sus consumidores y pasa sus pruebas antes del siguiente checkpoint.
3. Contract: Slice10 depende del journey integrado. Auditar consumidores actuales y eliminar solo lo sustituido. Durante migración puede existir código anterior; el estado final entrega una sola ruta activa por interacción. Cero referencias activas se demuestra con búsqueda de imports/handlers/selectores y replay del recorrido público, no con un flag permanentemente apagado.

## Inventario de retirada y preservación

| Área | Retirar cuando el reemplazo esté probado | Preservar / migrar con evidencia |
|---|---|---|
| PatientDiagnosis | lower create editor, «Cambiar pieza», foco forzado, refs/handlers/styles exclusivos, requisito Guardar para crear desde chart, estado duplicado de selección | modal de edición, dirty guard, retry exacto, conflicto, corrección lógica, historial y links a condiciones, adaptados a su nuevo Module |
| Dibujo y chart | perfiles genéricos de cuatro familias y máscaras/preview obsoletos; ramas responsivas sustituidas y helpers sin consumidores | numeración FDI/dentición, texto accesible, callbacks y tests externos útiles, perfiles nuevos, listados clínicos que siguen vigentes |
| Catálogo/presentación | listas de herramientas y switches de marca paralelos una vez todos consuman el registro único | aliases/códigos/labels históricos y la resolución de condiciones desconocidas; el registro nuevo no elimina el historial |
| Notas | rail duplicado de lectura general, estados/feed antiguos exclusivos de esa proyección | PatientNotes y API general en Información; notas generales permanecen distintas y aparecen tipadas en el feed combinado; no backfill destructivo |
| Pruebas/docs/config | assertions y selectores que exigían desplazamiento al editor; ramas temporales/imports/flags sin uso del área sustituida | sustituir por pruebas de los nuevos comportamientos; mantener suites de ownership, history, recovery y contrato público. Feature map y docs se actualizan en fase4 |
| Persistencia | ninguna tabla/columna histórica en este cambio | esquema de condiciones/notas generales y tablas nuevas; rollback de aplicación conserva registros. Una eventual retirada de esquema requeriría otro cambio y evidencia de cero uso |

Antes de borrar: registrar archivo/símbolo, caller, reemplazo y prueba que lo cubre. Buscar consumidores en `src`, tests frontend/backend, rutas y docs; revisar referencias dinámicas/selectores en el browser. La lista auditada es inicial: el inventario definitivo se actualiza contra el código al implementar, respetando cambios concurrentes. No borrar cambios ajenos, adapters necesarios, historias ni recursos fuera de diagnóstico/odontograma/notas/planes.

## Gate de salida

Pruebas renderizadas por PatientDetail/PatientDiagnosis, HTTP y browser demuestran el mismo comportamiento antes/después de retirar código. Confirmar con reload IDs/revisiones de registros previos, notas generales y borradores/planes nuevos; comprobar no-tool sin escritura, una aplicación por gesto, edición/conflicto/retry, hover de notas y local scroll. Registrar búsquedas de cero consumidores del recorrido retirado y lista exacta de eliminaciones. Full checks de AGENTS.md y rollback compatible después del contract. No declarar cleanup por una reducción de líneas ni usar down destructivo para recuperar producción.

## Refinamientos desde browser live

visual-parity-contract.md añade icon-key overrides por variante y palette/layer roles al registro único. ConditionSymbol solo se sustituye tras migrar sus consumidores de herramientas, chart, leyenda e historial; preservar badges de resolved/error en su reemplazo. No importar complete_item back-compat shim del source: la acción de próxima sesión usa el mismo comando de stage completion. El draft de notas no vive en dos mounts; Notas/Asistente tienen hit areas independientes. Estos criterios entran en los tests públicos y en el inventario de Slice10.
