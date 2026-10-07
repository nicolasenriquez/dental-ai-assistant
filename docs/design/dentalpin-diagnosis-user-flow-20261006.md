# DentalPin: recorrido de diagnóstico y mapa de código

Fecha: 6 de octubre de 2026. Referencia observada en el navegador nativo de Codex: `http://localhost:3000/patients/d6eebc99-9c0b-4ef8-bb6d-6bb9bd380a46`.

Paciente visible: Javier Sánchez Muñoz, 45 años. Recorrido de consulta y edición de borradores; no se guardaron diagnósticos, notas ni planes, ni se eliminaron registros. Las rutas de escritura se trazaron en código, pero su persistencia tras recarga no se probó.

Se leyó la skill `playwright-cli` solicitada. Para operar la pestaña nativa existente se usó `cua_repl`, incluyendo sus locators Playwright. No se abrió una sesión externa de CLI ni se grabó un video.

## 1. Entrada y composición de la pantalla

El usuario entra a Patients, abre al paciente y elige Clinical → Diagnosis. El encabezado del paciente permanece por encima del espacio clínico. Dentro de Diagnosis hay dos columnas a suficiente ancho:

```text
Clinical → Diagnosis
├─ Columna principal
│  ├─ Register conditions
│  │  ├─ Dental Chart → Permanent / Primary
│  │  ├─ Upper Arch / Lower Arch: vista lateral + oclusal
│  │  ├─ Whole mouth: registros globales
│  │  ├─ Diagnosis: categorías y herramientas
│  │  └─ Legend
│  ├─ Diagnosed conditions [cantidad]
│  └─ Diagnosis complete? → Create Treatment Plan
└─ Notes
   ├─ Encabezado con icono
   ├─ Composer: plantillas, texto, adjuntos, asociación, Save/Cancel
   └─ Cards de notas anteriores
```

Notes pertenece a un `aside` hermano de la columna principal. Por eso su icono está fuera de la tarjeta Register conditions y su encabezado queda alineado arriba con ella. No es una sección insertada al final del odontograma. El contenedor de notas tiene padding; cada card agrega su borde de color y separación vertical.

`DiagnosisMode.vue` usa flex con `items-start` desde 960 px de viewport; el rail tiene ancho 320 px, o 384 px desde `xl`. Por debajo de 960 px presenta un botón flotante Notas que abre un panel lateral. Esto depende del viewport, no de una medida del espacio restante entre otros paneles.

## 2. Dentición y lectura del chart

Para este adulto se usa Permanent, con 32 posiciones FDI. Primary representa la dentición temporal, con 20 posiciones según la definición de código. Cambiar la pestaña cambia la representación; no constituye un diagnóstico.

El orden permanente observado, de izquierda a derecha en pantalla, es:

| Arco | Mitad izquierda de pantalla | Mitad derecha de pantalla |
|---|---|---|
| Superior | 18,17,16,15,14,13,12,11 | 21,22,23,24,25,26,27,28 |
| Inferior | 48,47,46,45,44,43,42,41 | 31,32,33,34,35,36,37,38 |

Cada diente reúne dos SVG: lateral, para corona/raíces, y oclusal, para superficies. Su número FDI permite vincular gráfico, condiciones y notas. Los símbolos sobre el diente representan registros existentes o planificados; el brillo de hover es una interacción transitoria.

Sin herramienta activa, pulsar el diente permite consultar su popover. En el 36 se verificaron Crown y Full root canal, ambos bajo EXISTING, con fecha y la indicación Click to edit. No es solo un visor de notas: primero muestra tratamientos. Pulsar Full root canal abrió el modal de edición con Tooth 36, Existing/Planned, Notes, Delete, Cancel y Save. Se cerró con Cancel.

## 3. Elegir un diagnóstico o tratamiento

La barra muestra ocho categorías: Diagnostic, Restorative, Surgery, Endodontics, Orthodontics, Preventive, Periodontics y Pediatric. Los tiles de la categoría activa son botones con icono y nombre. Al elegir uno, aparece una selección resaltada y la instrucción Click on the tooth to apply junto a Cancel. Elegir la herramienta prepara el siguiente clic; no siempre abre un formulario completo.

Diagnostic mostró Pulpitis, Caries, Incipient caries, Pigmentation, Fracture, Missing, Periapical <2mm, Periapical 2-4mm, Periapical >4mm, Rotated, Displaced y Unerupted. Orthodontics estaba seleccionada al comenzar y mostraba Bracket (replacement), Fixed retainer, Invisalign attachments y Bracket bonding. Los nombres provienen del catálogo cuando hay entradas; existen constantes de fallback. No debe asumirse que cada tile equivale a un diagnóstico médico: la misma barra ofrece procedimientos terapéuticos.

### Caso con superficies: Caries en 16

1. Elegir Diagnostic y Caries.
2. Pulsar la vista lateral del 16.
3. Se abre Select Surfaces con Caries - Tooth 16, dibujo oclusal y lateral, y First molar upper right.
4. Seleccionar M Mesial y O Occlusal. También están D Distal, V Vestibular y L Lingual.
5. El contador pasa de 0 a 2; Confirm queda habilitado y aparecen las superficies seleccionadas.
6. Confirm ejecutaría el alta. Cancel cierra el selector sin crear el registro.

Se probaron los pasos 1–5 y Cancel. Al cancelar el selector, Caries seguía activa: hay que cancelar también la herramienta si se quiere volver a consultar sin aplicar.

### El clic puede guardar directamente

El código distingue tres caminos:

| Acción con herramienta activa | Resultado |
|---|---|
| Clic lateral/de diente con herramienta por superficies | Abre SurfaceSelectorPopup; Confirm llama a applyTreatment |
| Clic sobre una superficie oclusal con herramienta por superficies | Llama directamente a applyTreatment con esa superficie |
| Clic de diente con herramienta que no requiere superficies | Llama directamente a applyTreatment |

Por tanto, Bracket bonding no debe describirse como un flujo que siempre abre un pequeño modal antes de guardar. El camino normal de herramienta sin superficies es aplicación directa. Existen caminos específicos para selección multidiente, no probados en este recorrido.

En diagnosis, `applyTreatment` fija el estado frontend a `existing`, arma diente, scope, tipo clínico y/o identificador de catálogo y superficies cuando correspondan. Al recibir éxito, agrega una acción a la pila de Undo, muestra un toast, emite `treatmentsChanged` y limpia la herramienta. El padre vuelve a cargar los tratamientos.

## 4. Leyenda y significado visual

Legend expande una ayuda local. Se verificaron Existing y Planned, este último con P, y cinco grupos estáticos:

| Grupo | Símbolos listados en la leyenda |
|---|---|
| Diagnostic | Los doce diagnósticos descritos arriba |
| Restorative | Composite filling, Amalgam filling, Temporary filling, Sealant, Veneer, Inlay, Overlay, Crown |
| Surgery | Extraction, Implant, Apicoectomy |
| Endodontics | Full root canal, Root canal 2/3, Root canal 1/2, Post, Overfilled root canal |
| Orthodontics | Bracket, Tube, Band, Attachment, Retainer |

La leyenda no reproduce todas las entradas de las ocho categorías del catálogo. Se construye con constantes, mientras la paleta puede mostrar variantes del catálogo. El pequeño punto en los tiles se implementa con `.treatment-btn.is-surface::after`: identifica herramientas que trabajan por superficies, no un historial de uso.

En las reglas de representación, Pulpitis llena la pulpa en rojo; Caries usa relleno rojo en superficies; Incipient caries usa puntos naranja y Pigmentation puntos marrón. Composite filling usa azul. Fracture tiene color rosa oscuro; las lesiones periapicales distinguen tamaños y tonos rojos. Rotated usa violeta, Displaced ámbar y Unerupted gris con rayado. Los tratamientos planificados tienen indicadores/patrones diferenciados. Un color por sí solo no significa que un tile ya se haya usado: hay que distinguir el icono del concepto, el estado de selección de la herramienta y los registros dibujados en el chart.

## 5. Diagnosed conditions

Es una tarjeta plegable cuyo header muestra `conditions.length`. El filtro del padre incluye tratamientos con estado frontend existing y excluye `source_module = migration_import`.

La lista transforma los tratamientos en vistas por diente y agrupa por FDI, ordenadas por número. Una fila puede contener varios conceptos, separados visualmente, con superficies cuando corresponda. El 36 mostró Crown y Full root canal. Las acciones Treatment notes y Set recall llegan por slots de módulos adicionales.

El badge observado era 9; las filas dentales visibles eran 14,17,27,36,43,46. El badge cuenta registros de tratamiento, no dientes ni filas. Esta diferencia por sí sola no demuestra un error. Hay representación separada para condiciones generales sin diente.

El hover de una condición emite su FDI y resalta el chart; el hover del chart también alimenta los highlights compartidos.

## 6. Notas

El composer del rail crea notas de tipo diagnosis, propiedad del paciente, con diente opcional. La lista de abajo reúne notas de diferentes tipos, incluidos Treatment, Diagnosis y Administrative. Cada card muestra autor, fecha, tipo/contexto, cuerpo y Open context cuando corresponde. No todas las notas visibles pertenecen al diagnóstico actual.

1. Escribir texto o elegir una plantilla. Se probó Caries, que insertó Finding, Depth, Symptoms, Vitality test y Suggested treatment; Save quedó habilitado.
2. Revisar Attach to tooth N. Se observó pasar de 38 a 16 y después 36 durante el recorrido.
3. Mantenerlo marcado para asociar el diente propuesto o desmarcarlo para una nota sin diente.
4. Save envía el cuerpo, diente opcional y documentos adjuntos. Si funciona, el rail limpia el composer y recarga las cards. Si falla, mantiene el borrador para reintentar, según el código.
5. Cancel limpia el borrador y cierra el composer; Add note permite abrir uno nuevo.

La asociación merece atención: `handleToothHover` también cambia `selectedTooth`. El watcher del composer vuelve a marcar la asociación cuando recibe otro diente. Pasar el cursor por un diente puede cambiar el destino propuesto de una nota ya escrita; la variable no representa exclusivamente el último clic, pese al comentario del código.

Hover/focus en una card de nota resalta su diente explícito o los dientes del tratamiento dueño. Las notas administrativas sin vínculo dental no resaltan dientes. La edición de una nota existente envía solo el cuerpo; no equivale a reasociarla. Los botones de edición dependen de permisos y autoría. No se probaron guardado, carga de adjuntos ni eliminación.

## 7. Diagnosis complete? y transición al plan

Diagnosis complete? es una tarjeta contextual, visible cuando hay condiciones y la vista no es readonly. No declara formalmente terminado el diagnóstico ni guarda todos los cambios pendientes.

- Sin planes draft: ofrece Create Treatment Plan.
- Con uno: ofrece continuar ese plan.
- Con varios: permite seleccionar qué draft continuar.

Se pulsó Create Treatment Plan y se verificó el modal Create treatment plan: Title, Assigned professional, Additional notes, Cancel y Create plan. El texto explica que después se agregan tratamientos desde el odontograma o catálogo. Se canceló sin crear.

El evento create sube desde DiagnosisCTA, pasa por DiagnosisMode y DiagnosisModeContainer y llega a ClinicalTab, que abre TreatmentPlanModal. Tras una creación exitosa, ClinicalTab cambia al modo plans y selecciona el plan nuevo. Continuar un draft cambia directamente a plans con su identificador.

## 8. Ubicación del código y rutas de datos

La referencia DentalPin es Vue/Nuxt y está fuera de AI Tutor, bajo `C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/references/dentalpin`. No confundir estos componentes con el frontend React de este repositorio.

Todas las rutas siguientes son relativas a esa raíz:

| Responsabilidad | Archivo y punto de entrada |
|---|---|
| Submenú Clinical y modal de plan | `backend/app/modules/patients/frontend/components/patient/ClinicalTab.vue`, handleCreatePlan:81, handlePlanCreated:90 |
| Contenedor extensible de Diagnosis | `backend/app/modules/patients/frontend/components/patient/DiagnosisModeContainer.vue` |
| Columnas, filtros, contador y estado compartido | `backend/app/modules/odontogram/frontend/components/clinical/DiagnosisMode.vue`, handleToothHover:87 |
| Chart, selección, alta y edición | `backend/app/modules/odontogram/frontend/components/odontogram/OdontogramChart.vue`, handleSurfaceClick:346, handleToothClick:362, applyTreatment:517, handleEditTreatment:596 |
| Anatomía SVG, hover, popover y edición por diente | `backend/app/modules/odontogram/frontend/components/odontogram/ToothDualView.vue` |
| Categorías y tiles del catálogo | `backend/app/modules/odontogram/frontend/components/odontogram/TreatmentBar.vue` |
| Selector de superficies | `backend/app/modules/odontogram/frontend/components/odontogram/SurfaceSelectorPopup.vue` |
| Modal de edición | `backend/app/modules/odontogram/frontend/components/odontogram/TreatmentEditModal.vue` |
| Leyenda | `backend/app/modules/odontogram/frontend/components/odontogram/OdontogramLegend.vue` |
| Colores y reglas | `frontend/app/config/odontogramConstants.ts`; iconos en `TreatmentIcons.ts` junto al chart |
| Agrupación de condiciones | `backend/app/modules/odontogram/frontend/components/clinical/ConditionsList.vue`, groupedByTooth:27 |
| Tarjeta de transición al plan | `backend/app/modules/odontogram/frontend/components/clinical/DiagnosisCTA.vue` |
| Rail, carga de cards y guardado de notas | `backend/app/modules/clinical_notes/frontend/components/DiagnosisNotesSidebar.vue` |
| Borrador, plantillas y asociación de nota | `backend/app/modules/clinical_notes/frontend/components/NoteComposer.vue`, watcher:101, handleSubmit:121 |
| Presentación de cada nota | `backend/app/modules/clinical_notes/frontend/components/NoteCard.vue` |
| CRUD tratamientos | `backend/app/modules/odontogram/frontend/composables/useTreatments.ts`, createTreatment:103, updateTreatment:131 |
| CRUD notas | `backend/app/modules/clinical_notes/frontend/composables/useClinicalNotes.ts`, listRecentForPatient:51, createNote:88 |
| Autorización/validación de alta | `backend/app/modules/odontogram/router.py`, create_treatment:302 |
| Construcción y persistencia de tratamiento | `backend/app/modules/odontogram/service.py`, TreatmentService:482, create:641 |

Recorrido de datos de un alta dental:

```text
TreatmentBar selecciona tipo/catalog_item_id
 → ToothDualView emite tooth-click o surface-click
 → OdontogramChart prepara/aplica según el camino
 → useTreatments.createTreatment
 → POST /api/v1/odontogram/patients/{patientId}/treatments
 → router: permiso odontogram.treatments.write + validate_patient_access
 → TreatmentService.create → registros de tratamiento/dientes
 → respuesta → estado local/toast/Undo → treatmentsChanged
 → DiagnosisMode.fetchTreatments → condiciones agrupadas
```

El estado frontend `existing` se traduce a backend `performed`; `planned` se conserva. Al leer, `performed` vuelve a `existing`. Esta traducción es clave para entender por qué un procedimiento aparece en Diagnosed conditions.

Edición usa `PUT /api/v1/odontogram/treatments/{id}`. Notas usan `POST /api/v1/clinical_notes/notes`, edición `PATCH /api/v1/clinical_notes/notes/{id}` y lectura del rail `GET /api/v1/clinical_notes/patients/{id}/recent` con páginas de 20 y cursor temporal `before`.

## 9. Cobertura real de este recorrido

Verificado en navegador: identidad, Clinical/Diagnosis/Permanent, paleta Diagnostic y Orthodontics inicial, leyenda completa, selección Caries/16/M/O y cancelación, consulta de 36, modal de edición y cancelación, plantilla de nota y habilitación de Save, cards existentes, CTA y modal de plan con cancelación.

Trazado en código: alta inmediata, Confirm, actualización, recarga de condiciones, estados backend/frontend, Save de nota, permisos, asociación por hover y transición tras crear un plan.

Pendiente de una prueba con datos de prueba autorizados: altas y ediciones persistidas, Save de notas, recarga posterior, fallos/reintentos, Undo, adjuntos y creación efectiva de plan. Esta documentación registra el flujo completo y sus límites; no certifica esas escrituras como UAT exitoso.
