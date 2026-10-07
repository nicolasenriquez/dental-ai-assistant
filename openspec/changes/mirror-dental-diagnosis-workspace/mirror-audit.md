# Auditoría del mirror contra DentalPin

Revisión de código: 2026-10-06. Esta revisión corrige la especificación anterior; su validación sintáctica no demostraba fidelidad al producto de referencia. No se modifica código de producto. Las observaciones de navegador previas siguen teniendo sus límites de persistencia y móvil; este pase aporta evidencia de código, no nueva UAT.

## Hallazgos de la OpenSpec anterior

| Hallazgo | Evidencia DentalPin | Corrección requerida |
|---|---|---|
| P1: Sheet para inspección/edición cambia la interacción | ToothQuadrant.vue:121 UPopover; ToothTooltip.vue; TreatmentEditModal.vue usa UModal | Popover en la pieza, modal compacto para superficies y modal para editar registro. Sheet solo para notas en móvil. |
| P1: Guardar obligatorio por cada concepto no es el mirror | OdontogramChart.vue:346/362/517 | D03 aprobado por el usuario: aplicación directa con herramienta activa; selector lateral confirma superficies; clic oclusal aplica esa superficie. |
| P1: conservar cuatro perfiles simplificados impide reproducir la anatomía | ToothSVGPaths.ts:140/230/251 y tablas occlusales | Ocho posiciones permanentes, escalas individuales, remapeo temporal, anclajes anatómicos y simetrías. Dibujos independientes con estas proporciones y estados. |
| P1: cerrar plan requiere un botón adicional inventado | treatment_plan/service.py:1180 _check_and_complete_plan | Última ejecución completa el plan automáticamente cuando todos los ítems están completed. No añadir Completar plan intermedio. |
| P1: reabrir completed→draft no existe | service.py:147 VALID_PLAN_TRANSITIONS;1665 reopen;1817 reactivate | Reabrir es pending→draft; reactivar es closed→draft; completed→archived. No reutilizar estos nombres para otra transición. |
| P2: cancelar un ítem y excluirlo del denominador modifica el cierre | _check_and_complete_plan usa item.status != completed | Mostrar completados/total como referencia; un ítem cancelled impide auto-completar el plan. Cerrar es una acción distinta. |
| P2: tiempos120ms y prohibir desplazamientos no reproduce el pulido | ToothDualView.vue:1110 estilos; TreatmentBar.vue:1189 | Conservar150ms, desplazamientos suaves y pulsos con sus valores; reduced-motion global los desactiva. |
| P2: contadores Registrados en herramientas fueron añadidos | TreatmentBar.vue isSelected y .is-surface::after | Quitar contador inventado. Borde/fondo indica selección; dot6px indica superficies. |
| P2: geometría, patrones y color estaban descritos de forma genérica | ToothDualView.vue:433/469/809/918/1040; odontogramConstants.ts | Especificar capas, orden, clipping, patrones, opacidades, raíces ocultas y P para planificado. |
| P2: rail1064px/300px y notas read-only no son DentalPin | DiagnosisMode.vue:147/224/232 y DiagnosisNotesSidebar.vue | Referencia usa960px, rail320px/384px y compositor; móvil tiene botón flotante y slideover. Alcance de notas se resuelve explícitamente. |
| P2: superficie V obligatoria de carilla y restricción pediátrica fueron inferidas | SurfaceSelectorPopup.vue ofrece M/D/O/V/L; tipo/FDI del backend | No presentar restricciones nuevas como referencia. Conservar validación FDI y metadatos realmente soportados; distinguir representación V de validación clínica. |
| P2: leyenda dinámica completa fue una mejora no un mirror | OdontogramLegend.vue usa cinco TREATMENT_CATEGORIES estáticas | Reproducir leyenda colapsada, estados y cinco grupos básicos; las variantes heredan símbolo. Ocho categorías de paleta no equivalen a ocho grupos de leyenda. |

## Mapa de código → comportamiento → destino

Raíz de referencia: `C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/references/dentalpin`.

| Referencia relativa a la raíz | Responsabilidad | Destino Dental AI Assistant |
|---|---|---|
| backend/app/modules/odontogram/frontend/components/clinical/DiagnosisMode.vue | registrar condiciones, lista/CTA/rail; hover de pieza actualiza selectedTooth | PatientDiagnosis y nuevo compositor dental |
| .../odontogram/OdontogramChart.vue | herramienta, modos, click-to-apply, superficies, multi-selección, edición, undo | dueño de interacción del odontograma y comandos tipados |
| .../odontogram/ToothQuadrant.vue | popover por pieza, enlace hover, conectores entre miembros contiguos | PatientOdontogram y contexto de pieza |
| .../odontogram/ToothTooltip.vue | nombre anatómico, registros por existing/planned, badge superficies, clic para editar | popover contextual de pieza |
| .../odontogram/SurfaceSelectorPopup.vue | modal compacto, corona recortada, centros de superficie espejados, selección y confirmar | selector de superficies dental |
| .../odontogram/TreatmentEditModal.vue | editar notas/superficies/estado, borrar y realizar | modal de registro; revisión/corrección conserva garantías del target |
| .../odontogram/TreatmentBar.vue | categorías, variantes, tarjetas, selección/dot, modos single/multi | paleta de conceptos |
| .../odontogram/TreatmentIcons.ts y LateralViewIcons.ts | vocabulario de símbolos y variantes | registro de iconografía independiente |
| .../odontogram/ToothSVGPaths.ts | ocho anatomías, anclajes, superficies, escalas, patrones y simetría | toothGeometry.ts ampliado |
| .../odontogram/ToothDualView.vue | composición lateral/oclusal y estados/animación | ToothDrawing.tsx y capas diagnósticas |
| frontend/app/config/odontogramConstants.ts | colores, niveles pulpares, símbolos, tipo clínico, estados | odontogramPresentation.ts y catálogo de metadatos |
| frontend/app/assets/css/main.css:130,251,278 | reduced-motion; fondo, contorno, raíz, detalle, selección light/dark | tokens dentales semánticos en sistema de diseño |
| .../clinical/ConditionsList.vue | FDI ordenados, tratamientos/superficies, hover enlazado | lista agrupada de registros |
| .../clinical/DiagnosisCTA.vue | crear/continuar borrador; no completar diagnóstico | CTA diagnosis→plan |
| backend/app/modules/treatment_plan/service.py | sesiones, confirmación, reapertura/reactivación, autocierre | servicio de plan clínico con adaptación comercial D02 |

Los prefijos `.../odontogram/` y `.../clinical/` de esta tabla corresponden a `backend/app/modules/odontogram/frontend/components/`. Los números señalan el código inspeccionado; las futuras tareas deben revisar símbolos, no depender de líneas inmutables.

## Contrato de pulido visual

1. Anatomía:32 piezas permanentes y20 temporales; ocho perfiles por posición. Escalas laterales por posición1..8:0.65,0.62,0.62,0.62,0.62,0.95,1.0,1.20. Base55px y altura derivada del viewBox. Lateral container110px, corona superior alineada abajo e inferior arriba. Vista lateral/oclusal cambia orden entre arcadas; número fuera del grupo espejado. Q2/Q6 reflejan X; Q4/Q8 Y; Q3/Q7 ambos. No cambiar M/D al espejar solo su dibujo: espejo y etiquetas tienen el mismo sistema de centros.
2. Anatomía ausente: opacidad0.25 para missing/extraction existentes sin restauración sustitutiva; sustitución implant/bridge/crown/pattern evita desvanecimiento. Implant oculta raíces naturales; puente pontic no dibuja raíz. Esto es presentación derivada, no un nuevo diagnóstico persistido.
3. Pulpa: clipping del path anatómico; full, two_thirds y half. Implementación actual usa offsetY0.2/alto0.7 y offsetY0.35/alto0.5 para los parciales. Los comentarios del archivo no coinciden exactamente con los números: usar el cálculo ejecutado como evidencia.
4. Superficies: caries relleno rojo; incipiente punto naranja; pigmentación punto marrón; composite azul; amalgama gris; temporal verde; sellador contorno celeste. Redibujar el borde al final para que el relleno no tape la anatomía. Centros de superficie propios, no círculos genéricos que cubren la corona.
5. Patrones: no erupcionado rayas grises; corona diagonales ámbar; inlay puntos azules; overlay líneas horizontales; miembros protésicos/conectores según rol. Corona sobre implante y puente tienen además relleno lateral sólido. Inlay requiere selector de superficies pero se dibuja con patrón; una sola etiqueta surface era insuficiente.
6. Laterales: fractura, cruz de ausencia/extracción, lesión periapical en ápice, rotación sobre corona, desplazamiento lateral, perno, bracket/tubo/banda/ataches/retenedor; sobreobturación añade círculo más allá del ápice. Anclajes dependen del perfil. No reutilizar un emoji o el mismo punto para todos.
7. Estados: existing opacity1; planned opacity0.7 con P roja fuera de transformaciones SVG. Anillo seleccionado2.5px pulsa1.5s entre1 y0.6. Preview es outline relleno al50%, no hit target, pulsa1s entre0.4 y0.6, glow azul4px. Highlight enlazado usa glow ámbar6→10px,1s. Hover pieza translateY(-1px),150ms ease; card translateY(-2px),150ms y sombra4/12px. Fill/stroke150ms; pulpa fill200ms. Reduced-motion hace transición/animación prácticamente instantáneas y una iteración.
8. Tarjetas: grid auto-fill min104px, gap6px, altura mínima72px, padding7/6px, radio8px, borde2px; icono24px en zona26px; etiquetas multilínea. Estado seleccionado borde azul/fondo/halo3px; dot cyan6px top/right4px para surface. Aplicar tokens semánticos para estos colores, conservando diferencias entre conceptos y estados.

## Notas: flujo end-to-end comprobado en código

Referencias bajo `backend/app/modules/clinical_notes/`:

- `frontend/components/DiagnosisNotesSidebar.vue`: compositor abierto por defecto; create/update/delete; recent20 y loadMore; permisos; asociación y hover.
- `frontend/components/NoteComposer.vue`: texto, plantillas, checkbox de pieza, uploads, Guardar/Cancelar/reset.
- `frontend/components/NoteCard.vue`: badge por tipo, autor, fecha relativa, truncado280, mostrar más, vínculos, miniaturas y acciones.
- `frontend/composables/useClinicalNotes.ts`, `useNoteTypeMeta.ts`: transporte, tipos/colores/categorías de plantilla.
- `note_templates.py`, `frontend/i18n/locales/es.json`: nombres y campos de plantillas.
- `router.py`, `schemas.py`, `service.py`, `models.py`: validación, resolución de propietario/paciente, creación, edición solo texto, soft-delete y feed.
- Documentos/fotos y `media` son recursos separados; las notas enlazan IDs de documentos ya subidos.

```text
Diagnóstico → compositor abierto → escribir/aplicar plantilla
     hover pieza → selectedTooth → checkbox Vincular a pieza N
     desmarcar checkbox → nota sin pieza
     [opcional subir foto/PDF → documento existente → ID adjunto]
     Guardar → diagnosis + patient owner + pieza opcional + texto + IDs
     éxito → reset compositor → refrescar recent → tarjeta visible
     fallo → conservar texto y adjuntos → reintentar
     tarjeta hover/focus → resuelve pieza(s) → highlight en chart
     editar → cuerpo al compositor → PATCH solo cuerpo → refrescar
     eliminar → confirmación → soft-delete → refrescar
```

Detalles que no se deben inventar:

- La barra lateral lista todos los tipos de nota, aunque solo crea diagnosis. treatment/treatment_plan pertenecen a sus entidades y la nota administrativa pertenece al paciente. Appointment queda fuera por D02.
- Hover de diente cambia la pieza candidata de la nota; watcher vuelve a activar checkbox al recibir pieza. El guardado captura la pieza que se muestra al pulsar Guardar. Esto difiere del target anterior, que no tiene notas dentales tipadas.
- Plantilla agrega campos al final del texto con línea en blanco; no reemplaza contenido existente ni genera un diagnóstico automáticamente.
- Editar una nota existente cambia body únicamente. Aunque el compositor muestre otra pieza candidata, el PATCH no religa su asociación ni agrega nuevos adjuntos. Target debe reflejarlo en controles para evitar prometer otro resultado.
- Reset ocurre solo después de create/update exitoso. Cancelar limpia selección local de documentos, pero no elimina documentos ya subidos. Quitar adjunto del borrador tampoco elimina archivo remoto.
- Soft-delete conserva el registro. Solo autor o admin pueden editar/borrar en la referencia; target conserva modelo de dueño autenticado sin inventar roles clínicos.
- Feed recent usa created_at/before y20 elementos; target puede usar cursor compuesto para evitar saltarse empates, declarado como adaptación técnica sin alterar UX.
- Una tarjeta con pieza explícita destaca esa pieza; nota de treatment resuelve miembros mediante lookup; nota sin pieza/plan general no destaca dientes inventados.
- Las subidas son una escritura previa al guardado de nota. Requieren un dominio de archivos clínicos que Dental AI Assistant no tiene; no se puede prometer ese mirror reutilizando automáticamente Drive de evoluciones.

## Adaptaciones que deben quedar nombradas

D02 excluye presupuesto/agenda/cobros: pending→active necesita un registro manual de aceptación clínica, mientras DentalPin lo acopla al presupuesto. Es una adaptación aprobada, no comportamiento nativo de DentalPin. Owner-only/revisiones/idempotencia del target se conservan sin añadir paneles ni pasos a la creación directa aprobada D03. Undo mantiene el resultado visual de DentalPin pero revierte lógicamente con rastro clínico. Ilustraciones se producen de forma independiente con el contrato visual anterior; no se afirma que conservar los dibujos actuales equivalga al mirror.
