# Notas: contrato de mirror implementable

D04 incluye texto, plantillas y asociaciones; adjuntos quedan investigados y diferidos. El flujo fuente y sus límites están en mirror-audit.md. Este documento fija los campos y superficies del target sin incorporar agenda, galería o cobros.

## Tipos y superficies

| Tipo | Propietario | Creación | Presentación |
|---|---|---|---|
| diagnosis | paciente; pieza opcional | compositor abierto en Diagnóstico | badge Diagnóstico/info/Stethoscope; tarjeta con diente opcional |
| treatment | procedimiento | acción Notas del tratamiento junto al registro | badge Tratamiento/success/Syringe; vínculo al procedimiento y miembros |
| treatment_plan | plan | Nota del plan en su contexto | badge Plan/secondary/ListChecks; vínculo al plan |
| administrative | paciente, recurso general existente | Información actual | lectura combinada en feed dental; badge Administrativa/neutral/UserCog |

Usar los nombres españoles de `clinical_notes/frontend/i18n/locales/es.json`: Notas, Añadir nota, Plantillas, Asociar al diente N, Guardar, Cancelar, Cargar más, Ver más, Ver menos, Abrir contexto. No mostrar tipo/UUID interno al profesional. No copiar el texto fuente que promete recuperar una nota mediante soporte si el target no tiene ese servicio.

## Plantillas habilitadas

Los identificadores y categorías siguen `note_templates.py`; redactar formularios propios en español con estos campos, sin completar hechos clínicos. Las plantillas administrativas vinculadas con llamadas/citas no se agregan como funcionalidad nueva en este cambio.

| ID/categoría | Etiqueta de referencia | Campos que debe poder registrar |
|---|---|---|
| diagnosis_caries / diagnosis | Caries | hallazgo, profundidad, síntomas, vitalidad, tratamiento sugerido |
| diagnosis_periapical / diagnosis | Lesión periapical | pieza, imagen/radiografía, percusión/palpación, diagnóstico |
| general_follow_up / general | Seguimiento general | hallazgos, procedimiento, indicaciones |
| endo_single_visit / endodontics | Endodoncia (sesión única) | diagnóstico, anestesia, conductos, longitud de trabajo, obturación, postoperatorio |
| endo_multi_visit / endodontics | Endodoncia (varias sesiones) | sesión, conductos trabajados, medicación, siguiente revisión |
| perio_scaling / periodontics | Tartrectomía / RAR | cuadrantes, sondaje, sangrado, indicaciones de higiene |
| implant_placement / implantology | Colocación de implante | identificación/dimensiones, torque, estabilidad, injerto, postoperatorio |

Diagnosis solicita categoría diagnosis. Tratamiento/plan usa general por defecto, como useNoteTypeMeta; solo solicita una categoría clínica específica cuando el contexto realmente la envía. No inferir plantilla a partir del último hover de herramienta. Cambiar categoría refresca la lista, conserva body. Aplicar plantilla agrega texto separado por línea vacía; el usuario revisa y Guardar persiste.

## Comandos y estados

Crear: id/operation_id UUID estables, note_type, entity_kind/entity_id autorizados, body1..4000, optional dentition/tooth_fdi. El límite4000 y las revisiones provienen del target de notas existente y son adaptación técnica explícita, no dato atribuido a DentalPin. Persistir actor/time en servidor. Editar: expected_revision, operation_id y body únicamente; rechazar intentos de cambiar pieza/entidad por PATCH. Eliminar: confirmación del profesional, expected_revision y operation_id; soft-delete y revisión conservada. Un comando repetido idéntico devuelve el mismo recibo.

Lectura: feed combinado paciente+sus procedimientos+sus planes+notas generales, orden descendente por creación y UUID,20 por página, cursor atado a dueño/paciente/filtros. Metadata enlazada identifica tipo/etiqueta sin filtrar entidades ajenas. Lectura de nota/revisiones valida dueño incluso si la nota ya fue eliminada; feed activo omite eliminadas. Resolución por general-note ID usa su ruta existente, no tabla dental.

Texto vacío deshabilita Guardar. Guardando deshabilita doble envío y conserva el texto hasta recibo. Error mantiene texto y asociación capturada para reintento idéntico; cambiarlo inicia otro intento deliberado. Conflicto de edición compara última versión con texto local; ninguna sobrescritura silenciosa. Cancelar vuelve al estado inicial/cierra compositor; cambiar paciente no conserva IDs ni vínculos del anterior.

Hover de pieza crea candidato visible, no escritura. En creación, cambiar candidato vuelve a activar la asociación como el watcher fuente. Guardar captura el candidato mostrado. En edición, mostrar el vínculo guardado y no prometer que el hover lo cambiará. Tarjeta con diente destaca una pieza; tarjeta del procedimiento destaca todos sus miembros; nota del plan/sin diente no produce pieza ficticia. Focus y tap proporcionan la misma asociación visible.

## Evidencia de aceptación

Crear una nota sin pieza; crear otra asociada16 a partir de Caries; mover hover a17 antes de Guardar y verificar la asociación mostrada/capturada; desmarcar asociación y guardar sin pieza; provocar timeout y repetir sin duplicado; editar texto de la nota16 mientras se pasa por17 y verificar que sigue16; crear nota de puente y verificar highlight de miembros; comprobar21 registros/Cargar más; Ver más sobre body>280; eliminar/reload y revisar rastro; pasar rail→Sheet sin perder texto. Ningún control de adjuntos se muestra en esta fase.

## Matriz exacta candidato / highlight / asociación

| Gesto antes de Guardar | Candidato del compositor | Highlight transitorio | Asociación que se guarda |
|---|---|---|---|
| Inicio sin pieza | ninguno | ninguno | sin pieza |
| Entrar en16 y salir del chart |16 permanece |16 al entrar; se limpia al salir |16 si checkbox activo |
| Desmarcar16 y volver a la misma pieza |16 sin cambio |16 durante hover |sin pieza; no hay cambio de candidato que reactive el watcher |
| Desmarcar16 y entrar en17 |17; checkbox vuelve a activo |17 |17 salvo nueva desmarcación |
| Hover de fila de condiciones o tarjeta vinculada a18 |conserva el candidato anterior |18 o miembros del procedimiento |conserva candidato/checkbox anterior |
| Hover de nota sin pieza o plan, luego salir |conserva candidato |ninguno |conserva candidato/checkbox anterior |
| Edición de nota guardada en16 |vínculo16 inmutable |puede señalar otra pieza al inspeccionar |PATCH solo body; sigue16 |

Fuentes: `DiagnosisMode.vue:87–125` separa handleToothHover (actualiza selectedTooth solo con número) de handleConditionHover/handleNoteTeethHover (solo hoveredTeeth); `NoteComposer.vue:101–107` reactiva checkbox solo al cambiar el prop; `121–143` captura binding en Submit. Entrar/salir de tarjetas no debe alimentar de vuelta el candidato. No inventar selección nula al pointerleave. Al cambiar paciente reiniciar contexto de pieza y borrador según dirty guard; cambiar dentición limpia un candidato que ya no pertenece a la dentición visible: adaptación explícita para evitar una asociación oculta, no hecho atribuido al source.

## Distribución espacial comprobable

`DiagnosisMode.vue:139–225`: dos columnas align-start con gap-4 (16px); columna principal flex-1/min-width0/space-y-4: card Registrar condiciones → card Condiciones registradas con header colapsable y badge numérico → CTA contextual. El aside está fuera de esos cards, alineado al comienzo del panel; ancho320/384px sin encogerse. `DiagnosisNotesSidebar.vue:177–215`: sidebar con padding12px, gap12px, fondo muted/50 y radius del token; header con icono/título/acción, compositor, feed con overflow vertical y separación8px entre tarjetas. El icono Notas pertenece al header del rail, no al card Registrar condiciones. El feed tiene padding al final del scroll para no recortar controles.

El target debe preservar esa jerarquía, gaps y alineación utilizando tokens propios. No introducir un gran margen izquierdo en cada nota para simular el aside. Usar ancho de contenido del workspace para el umbral960px y comprobar shell abierto/cerrado; rail/Sheet son dos presentaciones del mismo estado, sin doble fetch ni doble compositor activo. Mobile conserva botón fixed end16/bottom16; ajustar su posición solo si hay solapamiento real con controles del shell, dejando evidencia de la adaptación.

## Live evidence and corrective adaptations

Native browser confirmed optional binding16, unchecked binding, existing text + Caries template append and successful local cancellation without Save. Source mobile Sheet contained one visible and one hidden textarea from two sidebar mounts; target requires one Module-owned draft/feed across presentations. Floating Notas was obstructed by Open IA at441px; visual-parity-contract.md requires separate hit areas and dock clearance. Neither side's patients were clinically mutated. New typed-note create/edit/delete persistence remains an implementation gate; current general-note SQL proofs do not substitute for it.
