# Comparación con DentalPin

## Fuentes y alcance

Referencia local indicada por usuario: `C:\Users\nenri\OneDrive\Desktop\proyectos\pry-ai-evaluator\references\dentalpin`. Commit `fc36a71b`, release v2.7.1. Código clínico vive en `backend/app/modules/odontogram/frontend/`, no solo en `frontend/app/components`.

Comparación estática del checkout. No se inició sesión ni se ejecutaron operaciones en DentalPin. No se presupone que sus documentos describan con precisión esta release ni se copiaron assets/componentes Vue.

Aliases abreviados:

- **Chart:** `backend/app/modules/odontogram/frontend/components/odontogram/OdontogramChart.vue`.
- **Bar:** mismo directorio, `TreatmentBar.vue`.
- **Selection:** `backend/app/modules/odontogram/frontend/composables/useOdontogramSelection.ts`.

Chart usa refs locales (`:96-139`), por lo que la existencia de resetSelection en Selection no demuestra que el componente montado lo use. Las conclusiones sobre comportamiento se basan en Chart.

## Tabla comparativa

| Área | Dental AI actual | DentalPin implementado | Recomendación | Justificación |
|---|---|---|---|---|
| Selección dental | Sin tool inspecciona; con tool deriva alcance. Foco histórico usa misma selección. | Chart `:346-375` deriva superficie/pieza/multi; refs distintos para tooth/tool/hover. | Conservar alcance derivado; separar referencia histórica y draft. | Una vía contextual ya existe; fallo nuestro es señalización. |
| Deselección | Cerrar pieza/Escape normales; histórico persistente; rango sin reset parcial. | Escape reinicia miembros antes de cancelar tool (`:299-308`); cancel global limpia tool/hover/rango (`:576-580`). | Escape escalonado + limpiar rango independiente. | Mejor control sin pedir decisiones adicionales. No asumir que cancela todos los estados de tooth. |
| Diálogos | Popover no modal + modal reusable de superficies/record/scope. | SurfaceSelectorPopup y MultiToothConfirmPopup; editor aparte. | Preservar patrones contextual/compacto; arreglar focus del modal común. | Nuestro modal ya es compacto; migrar todos a drawer aumenta esfuerzo. |
| Diagnósticos | Condiciones propias con active/resolved/error y revisiones; trabajo observado separado. | Chart diagnosis filtra herramientas y estado existente; ClinicalTab separa modos. | Conservar entidades, usar vocabulario de hallazgo/observación. | No convertir condición en treatment genérico para copiar referencia. |
| Procedimientos | Tooth/multi_tooth/global_arch y variantes fijas; performed preservado pero mal presentado. | Aplicación según tipo/alcance y status; globals recargan chart (`:583-589`). | Estado exhaustivo y catálogo como selector de alcance. | Registro compartido entre miembros, no una copia por diente. |
| Categorías | Ocho categorías; 29 restauradoras; leyenda primera variante. | Bar categorías específicas (`:692-701`); grupos globals y filtro largo (`:283-358,816-847`). | Categoría compacta + búsqueda contextual donde lista es larga. | Búsqueda en globals implementada no prueba búsqueda universal en todas categorías. |
| Edición | Guardar explícito, dirty guards y corrección reasoned. | Editor no cierra si update falla (`Chart:601-611`). | Conservar drafts, errores y expected_revision; simplificar jerarquía. | Patrón de recuperación útil; no copiar modelo de datos. |
| Eliminación | Corrección/entered_in_error; notas soft-delete; no borrado de condición por UI. | Delete tiene confirmación; conserva modal si falla (`:614-646`). Tratamientos soft-delete en service. | Conservar anotación clínica y soft-delete específico de notas. | Delete y corregir no son intercambiables. |
| Historial | Revisions y Activity source-backed; planes viejos read-only. | Timeline y view-only; también history section. | Historial por evidencia/revisión, no rehacer timeline completo. | Product actual prioriza ficha y evoluciones; temporal chart es otra capacidad. |

## Documentación frente a implementación

### Clinical-tab-redesign

`docs/features/clinical-tab-redesign.md:14-55` declara "Flujo Propuesto" y tres modos. No usar ese wireframe como prueba de UI actual. Código real soporta chart full/view-only/diagnosis/planning (`Chart:26-44,148-156`). Para nosotros, modos diarios vigentes son Diagnóstico y Evoluciones; no restaurar Planes por seguir un documento antiguo.

### Treatment-addition

`docs/features/treatment-addition.md:3-5` se identifica como Propuesta v2. `:39-64` distingue cobertura/gaps a esa fecha. Sus principios `:101-109` sí aportan criterios:

- Derivar alcance del item, ya compatible con nuestro catálogo.
- Usar odontograma como visualización y punto de activación, no formulario completo.
- Facilitar reversibilidad de drafts; acciones clínicas requieren trazabilidad.
- Separar planificación de diagnóstico.

Su afirmación histórica "no hay búsqueda" no aplica de forma universal al checkout actual: Bar implementa filtro para globals largos. Tampoco copiar declaración "sin datos a preservar" (`:88-97`); nuestra limpieza debe preservar registros/revisiones existentes.

### Unified-patient-workflow

`docs/features/unified-patient-workflow.md:3-7` declara decisiones validadas; `:32-65` describe modelo histórico ToothTreatment con presupuesto/factura/cita. Es un plan arquitectónico de otra etapa. Chart actual importa `Treatment`, `TreatmentCreate` y `ToothTreatmentView` (`:12-19`) y opera con `createTreatment`/`treatmentPlansApi.addItem` (`:537-544`).

Presupuestos, facturas, agenda, media, firmas y multi-tenancy no resuelven nuestros findings. Quedan fuera de propuesta.

## Patrones que conviene adoptar

1. Escape jerárquico para alcance múltiple antes de abandonar herramienta.
2. Alcance y superficies derivados del catálogo, sin menú previo "por diente/global/catálogo".
3. Categorías como navegación, opciones como operaciones; filtro solo donde reduce recorrido.
4. Editor permanece abierto con contenido cuando operación falla.
5. Mutación confirmada emite una señal de refresh para representaciones dependientes; nuestro equivalente puede ser callback local, no event bus nuevo.

## Patrones que no conviene copiar

- **Undo basado en delete.** Chart `:568-573` retira stack antes de await y anuncia undone sin comprobar retorno. `useTreatments.ts` devuelve boolean ante error. Es riesgo inferido estático en referencia; no modelo apropiado para clínica validada. Nuestro undo lógico con motivo/revisión es más seguro.
- **Dos writes para tratamiento planificado.** Chart `:537-544` crea treatment y después agrega item al plan. Posible partial success; no copiar esa composición para operaciones atómicas.
- **Estado global de selección por clave Nuxt.** Selection `:10-25` usa claves globales, mientras Chart usa refs locales. No trasladar dos implementaciones a React ni asumir que ese composable es autoridad visual.
- **Nuevos modos y dominio comercial.** Añadir planificación/agenda/presupuestos contradice retiro vigente y excede auditoría.
- **Una leyenda gigante por cada variante.** Comprensión puede lograrse con conceptos, variante contextual y texto; 63 filas empeorarían scrolling.

## Conclusión

DentalPin aporta ejemplos concretos de interacción contextual y escape escalonado. No es superior en garantías de corrección e idempotencia por el mero hecho de tener más capacidades. Nuestra propuesta adopta patrones de UI y mantiene las transacciones, UUIDs, revisiones y anotación de error existentes.
