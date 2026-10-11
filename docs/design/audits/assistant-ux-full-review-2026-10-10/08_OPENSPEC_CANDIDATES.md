# Backlog de candidatos OpenSpec — no creados

Propuesta posterior al Shape. No se crearon directorios de cambio, specifications, tickets externos o implementación. Un candidato no autoriza ampliar alcance ni cerrar el cambio activo harden-clinical-workspace-continuity.

Orden: C0 precede validación live; C1/C2 son los primeros parches de UX; C3 y C4 después; C5 opcional. C1/C2/C3 comparten archivos con continuidad: secuenciar, no ejecutar en paralelo. Los gates 14.2/14.3 pertenecen al cambio activo y no se duplican como un nuevo cambio.

## C0 — Paridad reproducible del entorno de revisión

- Findings: R01.
- Scope: manifest de HEAD/build/assets y comprobación de servidor de desarrollo. Diagnóstico antes de cualquier restart; conservar sesión y drafts.
- Ownership: entorno local y QA; ningún dominio clínico.
- Dependencias: determinar cómo localhost sirve los assets actuales y qué imagen/build corresponde.
- Riesgos: restart borra memoria del usuario; atribuir versión por filename sin hash; contaminación de evidence.
- Pruebas: comparar HTML/assets/hash reales, conservar estados existentes, repetir una entrada safe en navegador nativo.
- Impacto esperado: evidencia atribuible al cambio revisado, sin reclamar una mejora clínica.
- Aceptación: manifest reproducible con URL/HEAD/assets y diferencias explícitas; una sola versión usada para comparar antes/después.
- Rollback: conservar servidor anterior y sus parámetros antes de cualquier intervención autorizada; no purgar volúmenes.
- Conflictos: no sustituye integrated 14.1, ni cierra 14.2/14.3. Puede bastar como tarea operativa, sin OpenSpec nueva.

## C1 — Escritura usable dentro de paneles clínicos

- Findings: R03.
- Scope: layout local ClinicalComposer/ComposerShell según ancho de contenedor; herramientas debajo cuando compiten con escritura. Sin alterar hooks ni transporte.
- Ownership: clinical-assistant/ClinicalComposer y patrón composer; consumidor ContextualAssistant y full.
- Dependencias: C0 para validar live; contrato de targets/voz existente.
- Riesgos: esconder Stop/Encolar, overlays de dictado, adjuntos o editor; regresión chat si shell shared cambia globalmente.
- Pruebas: regresión componente para contenedor estrecho; navegador 360/390/768/1024/1440, panel 420–520 y Sheet; note larga/multilinea, attachments, queue3, voice states fixture; keyboard/zoom/coarse/reduced.
- Impacto esperado: texto legible y editable en ficha sin forzar salida al Assistant completo.
- Aceptación: textarea no se reduce a columna de letras; área de texto usa ancho de fila en modo compacto; todos controles alcanzables; continuidad y Enter/ShiftEnter/IME intactos.
- Rollback: revertir sólo composición/estilos locales; ninguna migración o limpieza de estado.
- Conflictos: continuidad compactó composer/targets; actualizar alcance dentro del cambio activo si aún corresponde, o esperar cierre antes de spec separada. No reescribir runtime.

## C2 — Decisión clara de contexto y origen retenido

- Findings: R02/R04.
- Scope: presentación, foco y copy de mantener/conservar/descartar; identidad de origen en compositor. Reutilizar AlertDialog/Button.
- Ownership: ClinicalAssistantArea y ClinicalComposer; revisión de ClinicalRuntimeProvider sin modificar almacenamiento.
- Dependencias: aprobación humana de modalidad y alcance de descarte; C1 para no reintroducir toolbar estrecha.
- Riesgos: wrong-context send, borrado de queue/adjuntos ajenos, default destructivo; cambios en paths clínicos sensibles.
- Pruebas: A→B, A→null, null→A; drafts/queue/attachments/editor; mantener, conservar, descartar; Escape/Tab/ShiftTab/focus return; lector de pantalla, targets; assert zero send/save/export al abrir/cerrar.
- Impacto esperado: el profesional entiende para quién está conservado el trabajo y qué decisión toma.
- Aceptación: modal real con foco o inline con rol coherente; botón seguro; origen anunciado; envio sigue bloqueado mientras contexto difiere; ninguna persistencia silenciosa.
- Rollback: volver presentación manteniendo guard lógico vigente; no remover protección del contexto.
- Conflictos: original-context guard del cambio activo, F02/F08 previos. No crear una segunda lógica. Human review de seguridad y buffers obligatorio.

## C3 — Recuperación con estado y propietario claros

- Findings: R11/R05; R06 como opción explícita.
- Scope: error de carga dedicado y retry del hilo; un aviso por operación de guardado; dock condicionable por visibilidad del destino.
- Ownership: useClinicalAssistant y ClinicalAssistantArea; EvolutionReviewArtifact como consumidor.
- Dependencias: conservar reconciliación canónica y los buffers del cambio activo; decisión humana sobre condición del dock.
- Riesgos: ocultar errores distintos, duplicar preparación/resolución, retry de write cuando sólo debía leer, pérdida de CTA fuera de vista.
- Pruebas: GET503→200; error404/403/401 conforme contrato, mensaje fallido sin perder note; save502, response-loss, recuperar y nueva intención; cerrar/reabrir review no resolve; transcript largo y offscreen.
- Impacto esperado: una siguiente acción clara y menor alarma duplicada.
- Aceptación: retry carga usa mismo hilo sin acquire nuevo; contenido intacto; errores de tareas distintas siguen visibles; dock recupera destino offscreen; ninguna aprobación automática.
- Rollback: revertir render/dedupe/CTA; mantener recovery y reconcile. No revertir controles de seguridad.
- Conflictos: integrated cubre failed save y response-loss en fixtures; DB response-loss/atomicity 14.2 sigue abierto. Las verificaciones backend reales no se sustituyen por el candidato.

## C4 — Pendientes mantiene el lugar tras retry

- Findings: R07.
- Scope: conservar páginas/foco al retry y al refresh por focus ventana; actualizar/remover item resuelto sin perder contexto.
- Ownership: useClinicalPendingWork y ClinicalPendingWork; API vigente sin nuevo endpoint obligatorio.
- Dependencias: decidir estrategia de refresco de páginas/ítem y cursor inválido.
- Riesgos: lista obsoleta, duplicados, item borrado manteniendo foco inexistente; polling innecesario.
- Pruebas: página2 con clinical/Drive; retry éxito/fallo/pending; refocus ventana, cursor caducado, item desaparecido; loading/error; navegación revisar/continuar con IDs exactos.
- Impacto esperado: revisar varios pendientes sin volver a buscar su lugar.
- Aceptación: páginas ya abiertas siguen disponibles tras retry; foco vuelve a elemento estable; resultado de copia actualizado; no convertir copia fallida en evolución sin guardar.
- Rollback: restaurar reload completo explícito y comunicado, sin modificar evolución o datos.
- Conflictos: route-backed pending y enlaces exactos del cambio activo; conservar dedupe por ID y separación de categorías.

## C5 — Semántica y consistencia localizada del artefacto

- Findings: R08/R09; R10 opcional fuera de este scope si exige cambio de navegación.
- Scope: heading level según composición y timestamp legible de atención. No cambiar fechas almacenadas ni zona horaria.
- Ownership: EvolutionReviewArtifact, lib/clinicalDate; consumidores full/contextual/manual.
- Dependencias: acuerdo sobre formato de DESIGN y surface brief; fixtures dos atenciones mismo día.
- Riesgos: headings dobles; alterar semántica temporal; scope creep hacia tipografía/paleta global.
- Pruebas: h1→h2 en full, h2→h3 en contextual; fecha/hora idéntica en artifact/review/ficha con bordes de día/DST; viewport/nombre largo y AT.
- Impacto esperado: navegación semántica y comparación temporal coherente.
- Aceptación: niveles sin saltos por composición, formato acordado, valor temporal intacto.
- Rollback: revertir props de presentación; no migración.
- Conflictos: identidad/date de artefacto actual; no rehacer la review ni el diseño. Actualizar autoridad sólo con aprobación y en el cambio autorizado.

## Lo que no merece todavía una OpenSpec

R10 puede ser una decisión local de navegación dependiente del sidebar, no un proyecto de IA nuevo. No abrir “rehacer clinical assistant”, “nuevo design system”, “persistir drafts en browser”, “automatizar aprobación”, “animar cada respuesta” o “unificar manual/chat” sin evidencia y decisión de producto.

Los candidatos son pequeños y reversibles; sus planes de pruebas son trabajo futuro, no resultados de esta corrida. Antes de crear cualquier spec: aprobar Shape, elegir primer scope, reconciliar archivos/tareas con continuidad y definir gates reales autorizados. Aquí se detiene Phase 7.

