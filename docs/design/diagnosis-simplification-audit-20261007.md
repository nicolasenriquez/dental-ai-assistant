# Auditoría de simplificación de Diagnóstico y notas

Fecha: 7 de octubre de 2026. Estado: diagnóstico y propuesta; sin cambios de producción.

## Evaluación

Dental AI Assistant tiene una base funcional aprovechable: selección de herramienta y pieza, selector de superficies, inspección sin escritura, catálogo en español y notas con vínculo opcional. Todavía no alcanza la coherencia visual de DentalPin. La prioridad es retirar rutas y controles que compiten con el flujo principal; después corregir geometría, jerarquía y foco. No se justifica reemplazar el sistema de componentes ni agregar una biblioteca.

La decisión vigente del usuario excluye **planes clínicos y plantillas de notas**. Sustituye las decisiones anteriores que los incorporaron. DentalPin sí ofrece ambos: retirarlos será una adaptación deliberada, no una reproducción literal de todas sus funciones. PRODUCT, el brief y la OpenSpec anteriores deberán alinearse al implementar esta nueva dirección; esta auditoría no los modifica.

## Método y límites

Se siguieron Playwright CLI como guía de verificación, Product Design Audit, criterios de Impeccable/Distill y Emil Design Engineering. Las interacciones se hicieron mediante la API Playwright del navegador nativo de Codex, no mediante un navegador externo. Se contrastó el código actual de ambos repositorios. El detector estático sobre siete archivos del flujo devolvió `[]`; esto no certifica geometría, accesibilidad ni calidad del recorrido.

Dental AI se probó con el paciente abierto por el usuario, sin condiciones guardadas y con una nota existente. DentalPin se revisó con un paciente poblado, nueve registros, después de que el usuario resolviera el acceso. El primer error de memoria de DentalPin quedó superado y no bloquea esta comparación.

Se inspeccionaron escritorio de 1440 × 900 CSS y ventana estrecha de 390 × 845 CSS en Dental AI. DentalPin se capturó aproximadamente a 1210 × 792, con otro tema y datos: las imágenes comparan estructura y geometría, no paridad píxel por píxel. Ventana estrecha no equivale a prueba en dispositivo táctil.

No se confirmaron diagnósticos, guardaron notas, crearon planes ni eliminaron registros. Se escribió únicamente un borrador sintético de nota, posteriormente cancelado y comprobado vacío. Persistencia, conflictos, reintentos y escrituras end-to-end quedan pendientes de una fixture desechable. No se ejecutó la suite completa: no hubo cambios de aplicación. Los controles de guardado no se consideran verificados por haber abierto sus formularios.

## Recorrido comprobado

1. Paciente → Clínica → Diagnóstico. Dental AI presenta cuatro modos; DentalPin presenta su propia navegación clínica más amplia.
2. Sin herramienta, clic o Enter sobre pieza 16 abre inspección sin escribir.
3. Se recorrieron las ocho categorías actuales de Dental AI: Diagnóstico 12, Restauradora 29, Cirugía 9, Endodoncia 11, Ortodoncia 6, Preventivo 1, Periodoncia 1 y Odontopediatría 6: **75 entradas**, ninguna deshabilitada en la dentición permanente revisada. Esto no demuestra compatibilidad de las 75 con todos los estados y denticiones.
4. Caries → pieza 16 → M → O abre el selector y habilita Confirmar. Cancelar cierra sin guardar. Se hizo el equivalente en DentalPin.
5. Dental AI agrega además una banda de **160 botones de superficie (32 × 5)** y un combo FDI. DentalPin resuelve la selección en el gráfico y el popup contextual.
6. Se revisaron condiciones y estado. El valor inicial en código es Actuales; una sesión observada en Todas no demuestra un defecto del valor inicial.
7. Notas: texto libre, asociación opcional a pieza, borrador conservado al cerrar/reabrir, cancelación, tarjeta existente. Desmarcar asociación se conserva al reabrir. Seleccionar plantilla agrega texto al borrador; ese mecanismo queda fuera del alcance vigente.
8. Se verificó que Planes expone un formulario real para Crear borrador. La ausencia de planes del paciente revisado no demuestra que la base de datos completa esté vacía.

## Evidencia visual

Capturas completas de viewport en `artifacts/diagnosis-simplification-20261007/`:

| Evidencia | Estado y utilidad |
|---|---|
| 03-ai-inspect.jpg | Inspección y contorno rectangular de selección |
| 04-ai-caries-selected.jpg | Banda redundante de superficies |
| 05-ai-surface-modal.jpg / 06-ai-surfaces-MO.jpg | Selector vacío y M/O; vista lateral recortada y color que excede la silueta |
| 07-ai-notes-sheet.jpg / 14-ai-narrow-notes.jpg | Jerarquía repetida de notas y dos combos de plantillas |
| 11-ai-desktop-chart-notes.jpg / 13-ai-narrow-chart.jpg | Distribución de escritorio y ventana estrecha |
| 15-ai-plans.jpg | Creación de plan todavía expuesta |
| 17-pin-diagnosis.jpg | Contenedor principal, anatomía, numeración y columna de notas de referencia |
| 19-pin-surfaces.jpg / 20-pin-surfaces-MO.jpg | Selector contextual de referencia y relleno clínico contenido |

## Hallazgos priorizados

No se demostró un P0. P1 indica desajuste importante del alcance o del flujo; P2, fricción/defecto visible o de accesibilidad; P3, refinamiento. La complejidad es una estimación relativa, no un plazo.

| ID / prioridad | Ubicación y evidencia | Problema y principio | Recomendación / resultado esperado | Complejidad |
|---|---|---|---|---|
| A1 / P1 | PatientDetail, PatientClinicalPlans, PatientPlanContinuation; captura 15 | Planificación, Planes y crear/continuar borrador contradicen el alcance vigente. Quitar sólo las pestañas deja comandos disponibles. | Retirar navegación y CTA; retirar o bloquear creación tras inventario de consumidores; mantener datos y referencias históricas. Dos modos clínicos útiles. | Alta por dependencias |
| A2 / P1 | PatientOdontogram; captura 04 | 160 controles adicionales repiten la selección y multiplican navegación por teclado. Un solo modelo de interacción. | Eliminar la banda; conservar pieza accesible + selector contextual de cinco superficies y selección gráfica. | Media |
| A3 / P2 | PatientDiagnosis 1206; captura 04 | Combo FDI redundante con 32 botones de piezas que ya responden a Enter. | Retirar combo y migrar sus referencias de foco/tests a la pieza o herramienta invocadora. No perder acceso por teclado. | Baja–media |
| A4 / P2 | DentalNoteComposer y useDentalClinicalNotes; 07/14 | Dos combos de plantillas añaden una decisión fuera del alcance. | Retirar ambos, estado, carga y appendTemplate si no hay otros consumidores. Mantener intacto el texto de notas anteriores. | Media |
| A5 / P2 | ToothDrawing, toothGeometry, ToothClinicalLayers; 06 vs 20 | Polígonos genéricos sin clip oclusal exceden el contorno. La anatomía debe contener los marcadores. | Compartir outline, clip y capas; rellenar según concepto; redibujar borde/fisuras por encima. | Media–alta |
| A6 / P2 | PatientDiagnosis, selector; 05/06 vs 19/20 | viewBox lateral 42 × 42 recorta un dibujo de mayor altura. El diálogo pierde contexto anatómico. | Usar encuadre de la geometría correspondiente; hacer gráfico y botones operables sobre una misma selección. | Media |
| A7 / P2 | PatientOdontogram, rect data-draft-tooth; 03 | Selección rectangular no sigue la silueta como el path oclusal de DentalPin. | Separar área accesible de clic del contorno visual; path anatómico y foco inequívoco. | Media |
| A8 / P2 | Numeración inferior, toothGeometry/PatientOdontogram; 11 | FDI 48 intersecta la vista oclusal: etiqueta y801.8–816.3, oclusal y799.2–822.1 en la muestra medida. | Reservar una fila de numeración independiente de transformaciones dentales; verificar las dos arcadas. | Media |
| A9 / P2 | Sheet de notas en PatientDiagnosis | Escape cierra el panel y el foco termina en BODY, confirmado en una lectura posterior al cierre. Continuidad de teclado. | Retornar al botón Notas; si desaparece, a un ancla estable del flujo. | Baja |
| A10 / P2 | Distribución de chart/aside; 11/13 | Breakpoint de pantalla no garantiza espacio para el gráfico; rail nominal w-80 mide 300 px con raíz de 15 px y el SVG excede su contenedor. | Definir distribución según ancho disponible, mantener desplazamiento local y usar Sheet cuando no cabe la columna. No cambiar tipografía global para arreglar este panel. | Media |
| A11 / P3 | DentalClinicalNotes, Composer, Card; 07/17 | Notas clínicas → Notas → Nota de diagnóstico → Nueva nota clínica repite jerarquía; contenedores anidados y autor UUID restan claridad. | Un encabezado, editor libre, asociación contextual y tarjetas compactas con identidad legible y borde semántico. Mantener edición/eliminación accesibles. | Baja–media |
| A12 / P2, propuesta | Estado en condiciones | Registradas por error no está duplicado arriba: allí se cambia dentición. Corrección e historial tienen valor clínico. | Sacarlo del filtro cotidiano y llevarlo a Historial de condiciones; conservar estado, motivo, vínculos y deshacer. | Media |
| A13 / P2, riesgo de código | ConditionSymbol/TreatmentSymbol y capas en PatientOdontogram | Símbolos externos y capas anatómicas podrían duplicar información o colisionar con datos poblados. El paciente objetivo vacío no permite demostrarlo visualmente. | Verificar fixture con múltiples condiciones; retirar sólo la representación redundante, conservando texto equivalente. | Media |

## Qué conservar, retirar y reorganizar

**Conservar:** 75 conceptos y 12 diagnósticos en español; identidad/categoría del catálogo; dentición; gráficos de ambas arcadas; inspección sin herramienta; escritura según herramienta; confirmación sólo cuando corresponde; validación, protección contra duplicados, ownership y reintentos; notas libres y asociación opcional; corrección e historial.

**Retirar de la experiencia vigente:** Planificación/Planes, creación/continuación de planes, combo FDI, banda de 160 superficies, combos de categorías/plantillas y sus cargas innecesarias. No confundir retirar una experiencia con borrar datos persistidos.

**Reorganizar:** condiciones actuales primero e historial secundario; asociación de nota como chip/checkbox explícito; una sola jerarquía de notas; geometría común para chart, preview y selector.

## Flujo final propuesto

```text
Paciente → Clínica → [Diagnóstico | Evoluciones]
                       |
     +-----------------+----------------------+------------------+
     | Registro de condiciones               | Notas            |
     | Odontograma [Permanente | Temporal]   | Texto libre       |
     | Superior / Inferior / FDI legible      | [ ] Vincular FDI  |
     | Categorías → tarjetas de conceptos    | Guardar / Cancelar|
     | Condiciones actuales → Historial      | Tarjetas de notas |
     +----------------------------------------+------------------+

Sin herramienta → pieza → inspección / registros / notas
Con herramienta → pieza → aplicación directa si corresponde
                       → superficies → Confirmar si corresponde
                       → feedback y registro actualizado

Nota → escribir → vincular pieza opcionalmente → Guardar
     → tarjeta → editar / corregir vínculo / eliminar según contrato
```

La pieza candidata por hover/foco puede mostrarse como ayuda; **no debe cambiar silenciosamente una asociación ya elegida mientras se escribe**. Mostrar claramente «Sin pieza» o FDI seleccionado. La selección explícita prima sobre movimientos accidentales. Probar pointer, teclado y touch; no depender exclusivamente del hover. Esto es una recomendación para el contrato final, no una conducta ya verificada en todos los dispositivos.

## Craft: antes, después y motivo

| Before | After | Why |
|---|---|---|
| Rectángulo alrededor del diente | Contorno siguiendo outline oclusal + foco visible independiente | Señalar la anatomía seleccionada sin sacrificar accesibilidad |
| Superficie azul genérica que sobresale | Color del concepto dentro de clip anatómico | Correspondencia clínica y precisión |
| Raíces cortadas en selector | Encuadre lateral coherente con su perfil | Conservar el contexto del diente |
| FDI mezclado con vista oclusal inferior | Línea de etiquetas con reserva espacial | Lectura rápida y sin superposición |
| Capas/iconos potencialmente duplicados | Capas clínicas con orden explícito; iconos explican el concepto en tarjeta/lista | Evitar ruido sobre el canvas |
| Varias cabeceras y cajas de notas | Cabecera única, compositor y tarjetas con borde lateral semántico | Jerarquía y parecido al referente sin copiar su complejidad |
| Dot entendido como «utilizado» | Indicadores separados para admite superficies, seleccionado y utilizado | El dot actual de Dental AI representa capacidad de superficies, no uso |
| Movimiento indiscriminado | Transiciones breves, aproximadamente 150–200 ms para selección/entrada, respeto a reduced-motion | Mantener respuesta rápida; no añadir teatralidad |

Mantener azul para acción/foco, y colores/patrones clínicos según concepto, acompañados de texto. El referente usa contornos, fisuras, patrones y rellenos; su calidad no se obtiene sólo aclarando el tema. Conservar el lenguaje del shell de Dental AI y refinar la superficie clínica.

DentalPin tampoco es perfecto: al abrir superficies se observó un popover de pieza simultáneo con el modal. Durante su salida apareció momentáneamente «Tooth 0» tras resetear selección; desapareció después. No replicar esas superposiciones ni resetear el contenido antes de terminar la transición.

## Fricción cuantificada sin inventar mejoras

| Elemento observado | Actual → propuesta |
|---|---|
| Modos clínicos de Dental AI | 4 → 2 |
| Combo adicional para pieza | 1 → 0 |
| Botones duplicados de superficies | 160 → 0 |
| CTA de crear/continuar plan en diagnóstico | 1 región → 0 |
| Combos de plantillas en nota | 2 → 0 |
| Caries M/O desde herramienta hasta Confirmar | 5 acciones; mantener, no prometer menos |

Aplicación directa sobre pieza sería herramienta + pieza (dos acciones), pero no se confirmó una escritura en esta auditoría. No hay medición de tiempo ni reducción porcentual validada.

## Accesibilidad y responsividad

Confirmado: piezas con botones y nombres; Enter abre inspección/selector; Confirmar se habilita con superficies; Cancelar permite salir; desplazamiento local del chart en ventana estrecha; cuadrantes con altura cercana a 44 px; borrador conserva texto al cerrar/reabrir; fallo de retorno de foco en Sheet.

Pendiente: recorrido completo de Tab tras retirar controles; lectores de pantalla reales; contraste cuantitativo en ambos temas; touch real; zoom 200%; movimiento reducido en runtime; accesibilidad con varias condiciones; validación y mensajes tras escritura. No declarar conformidad WCAG ni rendimiento sin esas pruebas.

## Código que explica la diferencia

Dental AI, relativo a la raíz del proyecto:

- `app/frontend/src/components/patients/PatientDiagnosis.tsx`: coordinación, combo FDI (1206), selector, filtro y continuación de plan (2407).
- `PatientOdontogram.tsx`: interacción SVG, hit areas, rectángulos de highlight/draft, etiquetas y banda de superficies.
- `ToothDrawing.tsx`, `toothGeometry.ts`, `ToothClinicalLayers.tsx`: ocho perfiles, viewBox, superficies genéricas y capas. Las capas tienen clips de corona/pulpa, pero falta el equivalente oclusal que contiene las superficies.
- `DentalClinicalNotes.tsx`, `DentalNoteComposer.tsx`, `DentalNoteCard.tsx`: jerarquía de rail/editor/tarjetas.
- `app/frontend/src/hooks/useDentalClinicalNotes.ts`: carga de templates y appendTemplate, además del estado útil de notas.
- `PatientDetail.tsx`, `PatientClinicalPlans.tsx`, `PatientPlanContinuation.tsx`, `PatientActivity.tsx`: navegación, comandos y vínculos de planes.
- `app/backend/routes/patient_treatment_plans.py`, `app/backend/db/patient_clinical_plans_repo.py`, migraciones 0026–0028: dominio persistido y referencias. Ocultarlo no lo retira.

DentalPin, raíz `C:\Users\nenri\OneDrive\Desktop\proyectos\pry-ai-evaluator\references\dentalpin`:

- `backend/app/modules/odontogram/frontend/components/odontogram/ToothDualView.vue`: viewBox/perfil, clip oclusal alrededor de líneas 776–805 y selección con `occlusalPaths.outline` alrededor de 1045–1060.
- `SurfaceSelectorPopup.vue` del mismo directorio: superficies contenidas, borde/fisuras encima, contexto de pieza, contador y confirmación.
- `backend/app/modules/odontogram/frontend/components/clinical/DiagnosisMode.vue`: separación del contenedor clínico y aside de notas, categorías y condiciones.
- `clinical_notes/frontend/components/NoteCard.vue` y `NoteComposer.vue`: metadata compacta y borde lateral semántico; plantillas/adjuntos no deben copiarse ahora.

No se propone copiar un componente Vue completo dentro de React. Extraer el contrato de geometría, estados y composición, adaptándolo al sistema existente.

## Limpieza segura y módulos

Una interfaz pequeña del odontograma debe ocultar geometría, transforms, hit testing, clips y orden de capas. El coordinador recibe pieza/superficies y estado de herramienta; no distribuye reglas anatómicas por página, popup y lista. El módulo de notas conserva borrador, vínculo, validación y persistencia detrás del hook existente. No crear un componente por cada línea ni una nueva abstracción para cada diagnóstico.

Antes de borrar: inventariar importaciones, callbacks, enlaces de Actividad, URL antiguas, API/clientes, tests y referencias persistidas. Migrar consumidores y anclas de foco, luego eliminar el código sin consumidores. Retirar cargas de templates y borradores de planes que ya no tienen vista. Mantener notas existentes, referencias a entidades históricas y auditoría. No eliminar tablas, revertir migraciones ni borrar registros para conseguir una interfaz limpia. Para URL antiguas, resolver una transición explícita a Diagnóstico/historial sin reactivar comandos de creación.

## Plan quirúrgico y puertas de verificación

| Orden | Slice | Puerta de salida |
|---|---|---|
| 1 | Alinear alcance y contratos; inventariar dependencias de planes/templates | Qué se retira y qué historia se conserva, consumidores identificados |
| 2 | Retirar navegación/CTA/combo/banda/templates y comandos de creación previstos | No hay creación por UI ni URL/API retirada; notas antiguas intactas; tests migrados al chart |
| 3 | Simplificar jerarquía y flujo contextual; foco y asociación de notas | Enter/Escape/Cancel restauran contexto; vínculo explícito estable; historial accesible |
| 4 | Unificar geometría, clips, capas, encuadre y FDI | Fixtures de todos los perfiles y categorías sin recortes/superposiciones |
| 5 | Pulir cards, iconos, colores, spacing, borders y transiciones | Capturas equivalentes en temas y tamaños; reduced-motion; sin dependencia nueva |
| 6 | Retirar código sin consumidores y validar integración | Inventario final cero consumidores muertos; lint/typecheck/tests requeridos y pruebas reales con fixture |

Matriz mínima de pruebas reales: permanente/temporal; pieza entera/superficies; inspección vacía/poblada; múltiples condiciones; diagnóstico y registro existente; cancelar/confirmar/recargar; duplicado/error/reintento; nota sin pieza/con pieza/cambiar vínculo/desvincular; guardar/editar/eliminar bajo contrato; cierre/reapertura y foco; desktop/ventana estrecha/zoom/touch; vínculos históricos y rechazo de creación de planes. Esas escrituras deben correr con datos desechables explícitos, no con la historia clínica real.

## Dictamen

La dirección de simplificación está suficientemente definida para preparar el cambio de implementación. **No se puede dar por cerrado el flujo persistido ni toda la fidelidad visual** con pruebas de lectura y cancelación: faltan fixtures pobladas del destino, escrituras reales controladas y matriz de accesibilidad. Corregir primero la estructura, después interacción y finalmente polish. La auditoría no implementó eliminaciones ni modificó la OpenSpec vigente.
