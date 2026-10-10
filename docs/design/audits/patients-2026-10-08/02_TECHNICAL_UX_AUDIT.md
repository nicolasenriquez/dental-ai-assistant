# Auditoría técnica UX

## Método y cobertura

Checkout `feat/ai-assisted-evolutions`, commit `7345f7a`. Runtime existente `http://localhost:8000`, contenedor `dynachat-app-blue`; no rebuild, inicio de servicios ni migraciones. Se comprobó concordancia de interacciones concretas con código; no se ha certificado que cada asset servido corresponda byte a byte al checkout.

Edge visible abierto mediante `playwright-cli -s=patient-audit open ... --browser=msedge --headed`. Login manual del usuario. Paciente UAT `69d83fe1-dcbd-4ca8-b946-ba7941b0c5cf`. Ninguna escritura clínica se envió al servidor. Borradores se descartaron; estados `performed` y dos condiciones activas se ensayaron con respuestas GET interceptadas.

### Evidencia y estados

- **Confirmado real:** comportamiento observado en datos sintéticos persistidos y UI real.
- **Confirmado con fixture:** reproducción en UI real con respuesta de lectura interceptada. No demuestra frecuencia en datos existentes.
- **Inferido estático:** mecanismo demostrado en código; escenario aún no recorrido en navegador.
- **Hipótesis:** requiere prueba para determinar si existe defecto.
- **Opcional:** mejora de diseño, no error funcional confirmado.

| Recorrido | Resultado y límite |
|---|---|
| Directorio, ficha, cuatro secciones | Recorrido real; búsqueda/lista y controles inspeccionados. No búsquedas con identificadores reales. |
| Odontograma vacío en Actuales | Real; Activity conserva 13 revisiones anteriores. Vacío actual no significa ausencia de historia. |
| Dientes 16/26, abrir/cerrar, mismo diente, Escape | Real; salida normal correcta, selección histórica persistente reproducida. |
| Superficies M, toggle y cancelación | Real y fixture; Confirmar deshabilitado sin superficies. |
| Clic externo seguido de Escape | Reproducido; foco BODY y diálogo permanece. |
| Cambio de sección con nota sin guardar | Real; diálogo "Nota sin guardar", Seguir editando/Descartar/Guardar y continuar. Se eligió Descartar. |
| Datos múltiples y procedimiento realizado | Fixture GET; no mutaciones a BD. |
| Error 503 de GET condiciones | Interceptado; error explícito y retry real recuperado. |
| Latencia GET Activity | Interceptada, 1500 ms; loading visible. |
| Activity existente y filtro Planes vacío | Real; filtro vacío distinguido de loading. |
| Deep link desde Activity y reload | Real; condición corregida e historial sobreviven reload. |
| Guardado exitoso/undo/corrección/conflicto | Tests existentes con API mock; no UAT de persistencia nueva en navegador. |
| Desktop/tablet/mobile | Contextos nuevos 1440×1000, 768×1024, 390×844; mobile con touch/coarse. No dispositivo físico. |
| Zoom, lector de pantalla, alto contraste | No validados exhaustivamente. Contexto inicial tenía zoom 80%; capturas nominales posteriores usan contextos nuevos. |

### Capturas

| Archivo | Contexto |
|---|---|
| [performed-fixture.png](performed-fixture.png) | Detalle `performed` interceptado y mal etiquetado; captura recortada del diálogo. |
| [surface-desktop.png](surface-desktop.png) | Selector de superficies; captura del diálogo. |
| [surface-mobile-390.png](surface-mobile-390.png) | Contexto independiente, ancho CSS 390, modal 360. |
| [diagnosis-mobile-390.png](diagnosis-mobile-390.png) | Diagnóstico real en contexto 390, docWidth 390. |
| [catalog-1440.png](catalog-1440.png) | Restauradora, 29 variantes, contexto 1440. |
| [catalog-768.png](catalog-768.png) | Restauradora, tablet 768. |
| [catalog-390.png](catalog-390.png) | Restauradora, touch 390; scroll y botón Notas. |
| [activity-existing.png](activity-existing.png) | 13 eventos persistidos del paciente UAT. |
| [diagnosis-tablet.png](diagnosis-tablet.png) / [diagnosis-mobile.png](diagnosis-mobile.png) | Capturas del main, regeneradas sin fixtures en contextos independientes CSS 768/390; docWidth igual al viewport. |

## Salud técnica

| Dimensión Impeccable Audit | Puntuación | Límite |
|---|---:|---|
| Accesibilidad | 2/4 | F02 y navegación de foco F12. Sin NVDA/axe integral. |
| Performance | 3/4 provisional | Sin regresión evidente en recorrido; sin perfil de CPU/LCP/INP ni benchmark. |
| Responsive | 3/4 | Sin overflow del documento en 390/768/1440; chart usa scroll intencional y cuadrantes. |
| Theming | 3/4 | Tokens y estética existentes conservados; hay overlays y valores arbitrarios heredados. |
| Integridad de implementación | 2/4 | F01 y contratos de contexto duplicados. Detector limpio no cubre esos mecanismos. |
| **Total** | **13/20 provisional** | **Aceptable; no es certificación de rendimiento o WCAG.** |

Inventario principal: 3 P1 y 9 P2. Ningún P0 confirmado. O01/O02 son recomendaciones opcionales, no entran en ese conteo.

## Findings

### F01 · P1 · Procedimiento realizado cambia de significado entre vistas

**Estado:** confirmado con fixture + esquema/producción de estado confirmados estáticamente.

**Reproducción:** interceptar GET `dental-treatments` y detalle con tratamiento `state=performed`; entrar en Diagnóstico y abrir su UUID mediante `treatment=`. Lista muestra "Existente"; editor muestra "Registrado por error · Solo lectura". Captura `performed-fixture.png`.

**Esperado:** "Realizado" en gráfico, lista y detalle. La disponibilidad de editar se decide separadamente de la etiqueta clínica.

**Causa:** `src/components/patients/TreatmentRecordModal.tsx:41,107` asocia `state !== existing` con error. `PatientDiagnosis.tsx:1969-1992,2103-2106` reduce estados a error/existente. `PatientOdontogram.tsx:143-145,403-411` tampoco distingue realizado. Esquema admite `performed` en `backend/alembic/versions/0025_patient_dental_treatments.py:20-21`; ejecución de planes lo genera en `backend/db/patient_clinical_plans_repo.py:400-405`.

**Alcance:** todo procedimiento realizado que llega a estas representaciones; frecuencia real no medida. No se demostró escritura incorrecta. Propuesta S1; test T01.

La fixture final usa `provenance=planned_in_clinic`, compatible con el schema. El mensaje de historial incompleto en su captura corresponde a un UUID sintético sin revisiones reales; no se contabiliza como finding adicional.

### F02 · P1 · Backdrop permite perder foco y Escape deja de cerrar

**Estado:** confirmado real y con fixture.

**Reproducción:** Caries → pieza 16 desde botón completo → selector; clic en coordenadas 2,2 del backdrop → Escape. Resultado `{dialog:1, focus:BODY}`, seguido de diálogo aún abierto. Cancelar superficies sí cierra.

**Esperado:** focus permanece en diálogo o retorna a él; Escape sigue cancelando conforme a reglas del borrador. Clic externo no debe convertir diálogo modal en estado sin teclado predecible.

**Causa:** `DentalConditionModal.tsx:43-56` coloca `onKeyDown` solo en panel. Backdrop no cancela ni preserva foco. `:58-80` hace wrap de Tab dentro del panel, pero no recupera foco cuando está en BODY. Siblings `inert` no resuelven ese escape.

**Alcance:** modales que reutilizan este componente, incluidos procedimientos y alcance múltiple; esos dos escenarios adicionales necesitan reproducción. Riesgo WCAG 2.1.1/2.4.3; no afirmar trap absoluto porque Cancelar funciona con mouse. Propuesta S2; T02.

### F03 · P1 · Cerrar inspección no elimina apariencia de pieza seleccionada histórica

**Estado:** confirmado real.

**Reproducción:** Activity → primera "Condición corregida · Pieza 26" → inspeccionar pieza 26 → Cerrar pieza → Escape. `aria-pressed` queda `true` después de ambos cierres; reload mantiene referencia e historial.

**Esperado:** referencia histórica puede permanecer visible, pero no representar selección de edición. "Cerrar pieza" termina inspección; un gesto de limpiar contexto debe ser identificable.

**Causa:** `PatientDiagnosis.tsx:1178-1183` combina superficie, inspección, borrador y `focused` en `selectedTooth`. Escape `:854-864` limpia herramienta/inspección, no foco histórico. `PatientOdontogram.tsx:383-384,446-447` comunica todos esos estados como pressed. Historial sí se alterna con `PatientDiagnosis.tsx:1943-1947`, pero es una salida distante y poco reconocible.

**Alcance:** acceso a condición por URL/Activity o selección de historial. No ocurre al cerrar una inspección ordinaria sin foco histórico. Propuesta S2; T03.

### F04 · P2 · No hay reinicio parcial explícito para rango de piezas

**Estado:** inferido estático; tests prueban rango/libre y cancelación global.

`useDentalWorkspace.ts:289-300` alterna primer extremo y segundo extremo; mismo diente produce rango unitario, no clear. `PatientDiagnosis.tsx:1011-1039` ofrece modo y revisar; `:1133-1138` cancela herramienta entera.

**Esperado:** limpiar miembros/rango sin perder herramienta. Mantener toggle libre existente y regla de misma arcada. No cambiar arbitrariamente qué significa segundo clic en rango. Propuesta S2; T04.

### F05 · P2 · Restauradora presenta 29 tarjetas sin filtro contextual

**Estado:** confirmado real; juicio UX apoyado por conteo y capturas.

GET catálogo real devuelve 63 variantes terapéuticas y ocho categorías; Restauradora tiene 29. `odontogramPresentation.ts:159-172` conserva orden de catálogo; `PatientDiagnosis.tsx:1223-1233` muestra todas en grid, minHeight 72. Mobile muestra dos columnas y muchos grupos de scroll. Capturas catalog-*.

**Esperado:** búsqueda contextual simple, orden clínico documentado y grupos cuando aporten significado. No inventar orden alfabético universal ni recortar capacidades. Propuesta S4; T05.

### F06 · P2 · Categoría y operación comparten demasiado lenguaje visual

**Estado:** confirmado en código y visual; problema de jerarquía, no semántica ARIA ausente.

`PatientDiagnosis.tsx:1207-1218` y `:1225-1233` usan `clinicalSecondary`, borde, pressed y fondo similares. Tarjetas incluyen icono y mayor altura, por lo que no son literalmente idénticas. Navegación Diagnóstico y categoría Diagnóstico duplican nombre con funciones distintas.

**Esperado:** selector de categoría subordinado al título Catálogo; opciones clínicas tratadas como acciones con estado de herramienta. No colocar ocho categorías en segmented control estrecho. S4; T06.

### F07 · P2 · Activity presenta planes históricos sin delimitar su retiro

**Estado:** confirmado real + causa estática.

Filtro Planes y texto "planes y notas" aparecen en `PatientActivity.tsx:14-21,51-52`. Creación está retirada, `backend/routes/patient_treatment_plans.py:50-57`; evidencia read-only sigue montada, `PatientDetail.tsx:468-473` y `PatientClinicalPlanHistory.tsx:15,55-67`.

**Esperado:** conservar eventos/enlaces bajo etiqueta histórica y distinguir notas generales/clínicas. Activity es feed derivado, no formulario de planes. No se encontraron botones de crear plan en esa superficie.

**Causa:** ampliación original de planes y notas en OpenSpec, seguida de retiro de authoring el 7 de octubre; se preservaron filtros y enlaces. No es prueba de un borrado incompleto de datos. S3; T07.

### F08 · P2 · Leyenda usa primera variante como explicación de un tipo completo

**Estado:** inferido estático + catálogo real consultado.

`DentalLegend.tsx:6-35,67-74` mantiene grupos fijos y usa `.find(v.clinical_type===type)`. Hay ocho variantes `crown`, incluida corona pediátrica. Leyenda muestra primera etiqueta metal-cerámica para tipo crown; palette permite elegir otras. No se encontraron tipos habilitados fuera de la lista fija en catálogo consultado.

**Esperado:** leyenda por concepto visual, sin implicar que primera variante es única. Explicar variante exacta en contexto; no desplegar 63 filas nuevas. S4; T08.

### F09 · P2 · URLs clínicas no se limpian de forma uniforme

**Estado:** falta de `clinical=diagnosis` confirmada real; `plan=` residual inferido estático.

Activity produce `?tab=clinical&condition=...` en `backend/routes/patient_activity.py:114`; hoy resuelve bien por default en `PatientDetail.tsx:151-156`. Diagnóstico elimina treatment/dental_note/history pero no plan, `:407-415`; Evoluciones sí elimina plan, `:433-440`.

**Esperado:** URL canónica con modo explícito y solo IDs del contexto que representa. No tratar link actual como 404 ni afirmar pérdida de datos; falla contrato y complica navegación futura. S3; T09.

### F10 · P2 · Historial de nota clínica pierde nombre profesional disponible

**Estado:** inferido estático.

Backend devuelve `actor_display_name`, `backend/db/patient_clinical_notes_repo.py:255-264`; tipo `DentalNoteRevision` lo omite, `src/lib/api.ts:1451-1457`; `PatientDentalNoteDetail.tsx:87` fuerza null. Resultado probable UUID pese a nombre disponible.

**Esperado:** label declarado del autor si existe; UUID distinguible en ausencia, sin inventar profesión. S5; T10.

### F11 · P2 · Activity de evolución carece de autor persistido

**Estado:** inferido estático; no se inspeccionó evolución de un paciente real para probarlo visualmente.

`backend/db/patient_activity_repo.py:24-27` proyecta NULL como actor; migración `0006_add_patients_and_evolutions.py:56-63` no guarda actor. `PatientActorLabel.tsx:7-8` resuelve "Autor no disponible".

**Esperado:** distinguir owner, profesional declarado y actor de aprobación/guardado. Nunca usar owner como autor histórico sin evidencia. Nuevos registros necesitan atribución durable si producto la requiere. S6 condicional; T11.

### F12 · P2 · Destinos de nota clínica/plan no colocan foco contextual

**Estado:** inferido estático.

`PatientDentalNoteDetail.tsx:44-56` y `PatientClinicalPlanHistory.tsx:26-55` leen/renderizan sin foco programático al destino. No es equivalente al wrapper de inspección no modal, que sí enfoca panel.

**Esperado:** después de navegar desde Activity, foco y anuncio identifican recurso; paginar no roba foco. WCAG 2.4.3 como referencia. S3/S5; T12.

## Mejoras opcionales e hipótesis

- **O01.** Móvil ya tiene scroll de arcadas y selector por cuadrante (`PatientOdontogram.tsx:158-161,415-459`). Preferir un cuadrante visible por defecto puede ahorrar altura. Es mejora opcional; no imponer reordenamiento anatómico ascendente.
- **O02.** Notas flotante solapa parte de una tarjeta en catalog-390. Reservar espacio o mover al encabezado; medir target/foco antes de declararlo bloqueo WCAG 2.4.11.
- **H01.** Scope de retiro backend de planes. Comandos de edición/items/stages/ejecución siguen disponibles para planes existentes (`patient_treatment_plans.py:65-226`). Resolver política de producto antes de deshabilitarlos. No se demostró fallo de permisos.
- **H02.** Corrección con replacement de multi-pieza y pérdida de respuesta debe verificarse con PostgreSQL aislado antes de tocar sincronización. Código tiene transacciones/receipts; no hay defecto confirmado.

## Integridad clínica y controles positivos

Condiciones usan transacciones y bloqueo de registro (`patient_conditions_repo.py:74-76,189,220,300`), snapshots append-only y enlace original/reemplazo. Tratamientos usan comandos durables y transacción (`patient_treatments_repo.py:148-157,301`). Notas clínicas borran lógicamente (`patient_clinical_notes_repo.py:144-177`) y conservan revisiones. Ownership se aplica por owner+paciente y FKs compuestas (`0025:28-41`, `0026:24-36`, `0028:33-36`). Activity es query read-only repeatable_read, `patient_activity_repo.py:13-19`.

FKs con CASCADE no justifican borrar un padre desde UI. El encargo no necesita DELETE de datos clínicos. No se halló una segunda BD o cache clínica persistente frontend: hooks tienen copias locales; Activity vuelve a leer al montarse. Riesgo de cross-tab stale no fue ensayado.

## Accesibilidad y controles ejecutados

Botones de diente tienen nombre FDI y pressed; SVG tiene título; superficies tienen checkbox y label. Focus visible existe en odontograma. Modal declara aria-modal y aplica inert. Popover es no modal y tiene Cerrar pieza suministrado por PatientDiagnosis; ausencia de focus trap allí no constituye por sí sola un defecto. Se descartó el finding inicial "no existe botón de cerrar".

No confundir 44 px del contrato del producto con mínimo WCAG 2.5.8 AA de 24 px y excepciones de espaciado. Targets de tooth/cuadrante y categorías tienen minHeight 44; no se comprobó cada target de cada subflujo ni todos los contrastes. AA completo, 200% zoom, NVDA y reduced-motion en todas las variantes siguen como gates S7.

Detector Impeccable CLI, ejecutado por Assessment B sobre `app/frontend/src/components/patients`, devolvió cero findings (`[]`). No hubo overlay, Lighthouse, axe ni perfil performance. No convertir ese cero en aprobación accesible.

### Tests existentes ejecutados

Desde `app/frontend`:

```powershell
bun run test -- src/components/patients/PatientDiagnosis.test.tsx src/components/patients/PatientDiagnosis.treatments.test.tsx src/components/patients/PatientActivity.test.tsx src/components/patients/PatientOdontogram.test.tsx src/components/patients/DentalClinicalNotes.test.tsx
```

**Resultado: 5 archivos, 71 tests passed.** Cubren lectura incompleta, deep links, retry idempotente, undo lógico, conflictos, selección múltiple y guards. Warnings existentes de React Router/Vite y act(...), sin fallos. No se modificaron tests. La suite no cubre suficientemente F01/F02/F03; sus resultados no invalidan las reproducciones.

Backend, concurrencia PostgreSQL y persistencia nueva quedan revisados estáticamente en este informe. Resultados exploratorios del subagente no se usan como gate de implementación porque no registró comandos completos. No se corrió suite full de lint/types/backend al no haber cambios de aplicación.
