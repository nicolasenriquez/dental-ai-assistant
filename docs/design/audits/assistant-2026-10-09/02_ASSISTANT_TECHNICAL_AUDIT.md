# Auditoría técnica del Asistente

Checkout: `7345f7a` · 2026-10-09 · Sin cambios de aplicación.

## Método y confianza

- **B-C:** confirmado en navegador headed con JS compilado del checkout e interceptación sintética.
- **B-S:** confirmado en navegador con bundle servido local; no se presume paridad JS.
- **T:** confirmado por pruebas existentes ejecutadas; no reemplaza una regresión del hallazgo.
- **I:** inferido de código; todavía no prueba integración real.
- **O:** mejora opcional / decisión de producto, no bug demostrado.

Las líneas corresponden al checkout auditado. `src/` significa `app/frontend/src/`; `backend/` significa `app/backend/`. La causa raíz es una inferencia explicativa incluso cuando el síntoma fue reproducido. El estado de aprobación y los resultados del servidor se simularon; no se ejecutaron transacciones clínicas reales.

## Hallazgos reproducidos

### F01. Cancelación tardía altera otra conversación · P1 · B-C

**Impacto:** interrumpe la suscripción activa de un segundo hilo y borra su representación local. El usuario pierde visibilidad y controles de un trabajo distinto del que detuvo.

**Reproducción:** iniciar stream de hilo A → Stop con respuesta cancel demorada → navegar a B → iniciar stream B → resolver cancel A. Resultado: URL B; `secondAborted:true`; Stop desaparece; transcript vuelve a starters vacíos. [Resultado](evidence/stop-race-result.txt), [script](evidence/stop-race.js), [captura](evidence/stop-race-second.png).

**Causa probable:** `src/hooks/useClinicalAssistant.ts:902–947`: callbacks de Stop usan `abortRef.current` y mutan runtime tras awaits sin comprobar que siguen perteneciendo al mismo hilo/turno. Contraste con capturas `scope` de otras acciones en líneas 829, 870 y 882.

**Límite:** prueba cancelación del stream/subscriptor **frontend B**, no cancelación del turno backend B ni pérdida persistida. `turn_runner.py` desacopla ejecución y subscriber.

**Corrección acotada:** capturar hilo, turno y controller exactos; abortar solo ese controller; ignorar/reconciliar resultados obsoletos sin mutar la conversación actual. Evitar un simple booleano global. Regresión obligatoria con cancel demorada, navegación y stream B.

### F02. Quitar paciente conserva nota/adjunto sin frontera contextual · P1 · B-S + I

**Impacto:** material redactado o adjuntado en contexto de un paciente permanece disponible bajo «sin paciente», sin pedir una decisión explícita. Es riesgo de uso contextual, no prueba de guardado en paciente equivocado.

**Reproducción:** seleccionar paciente sintético → redactar nota y adjuntar selección Drive → Quitar paciente activo. El texto y el chip permanecen; no aparece confirmación. [Resultado](evidence/edit-context-result.txt), [captura](evidence/attachment-patient-removed.png).

**Causa probable:** `ClinicalAssistantArea.tsx:73–95,158–171` conserva texto/adjuntos por hilo; `requestPatientChange` protege voz, no vincula trabajo no enviado a un contexto de paciente. La cola sí conserva/compara `patientId` (línea 300), lo que produce reglas distintas para material equivalente. `backend/db/clinical_assistant_repo.py:set_active_patient` owner-checkea paciente, pero el update ordinario no incorpora condición de turno activo.

**Corrección:** transición explícita para trabajo clínico contextual: cancelar cambio, conservar vinculación anterior o descartar conscientemente. No inferir nuevo paciente desde texto; no transferir adjuntos silenciosamente. Determinar si notas globales sin paciente deben quedar exentas (decisión D01).

### F03. Artefacto pierde identidad de paciente al quitar contexto activo · P1 · B-S + I

**Impacto:** un borrador persistido sigue ligado a paciente, pero su presentación deja de mostrar ese paciente. Debilita la frontera de revisión humana.

**Reproducción:** hidratar artefacto de paciente → quitar paciente activo → observar metadata del mismo artefacto. [Captura](evidence/draft-without-patient.png), [resultado](evidence/edit-context-result.txt).

**Causa probable:** `ClinicalTranscript.tsx:266` pasa paciente solo si `activePatient.id === item.patientId`; `ClinicalEvolutionArtifact.tsx:326` depende de `patient ?? approval?.patient`. Antes de aprobación no hay necesariamente fallback histórico.

**Corrección:** renderizar identidad histórica del artefacto desde datos owner-scoped; paciente activo modifica futuros trabajos, no borra metadata histórica. Si el payload no permite resolver identidad, declarar limitación y evaluar enriquecimiento aditivo, no rebind del artefacto.

### F04. Edición de campo sin Aplicar se pierde al navegar · P1 · B-C

**Impacto:** pérdida silenciosa de trabajo. El borrador base sigue existiendo, pero el texto que el clínico acaba de introducir no.

**Reproducción:** Editar síntesis → escribir `Texto SIN APLICAR…` → Pendientes → volver al hilo. No hubo guard; solo queda síntesis anterior. [Resultado checkout](evidence/checkout-edit-result.txt), [antes](evidence/field-edit-before-navigation.png), [después](evidence/field-edit-after-navigation.png).

**Causa probable:** `EvolutionReviewArtifact.tsx:90–116,160–162` mantiene `editingValue` local; `onChange` se ejecuta al aplicar. Aunque existe edición dirty local, no participa del guard de ruta/provider. Unmount destruye el buffer.

**Corrección:** incluir buffer de campo en transición dirty y conservarlo por identidad de artefacto al cambiar superficie. Cancelar edición debe ser una decisión distinta de abandonar ruta. No guardar automáticamente en ficha.

### F05. Escape deja Revisión sin controles locales · P1 · B-C

**Impacto:** el usuario cierra una confirmación sin aprobar y queda sin acceso visible a confirmar o seguir editando. Recarga restaura controles.

**Reproducción:** preparar revisión que autoabre diálogo → Escape → inspeccionar artifact. `visibleReview:0`, `dialogs:0`. [Resultado](evidence/checkout-escape-result.txt), [captura](evidence/checkout-escape.png).

**Causa probable:** `ApprovalRequestItem.tsx:48,82,144,175`: `autoOpen` abre, pero `!autoOpen` controla los triggers. Cerrar no cambia el estado del trigger; el effect no reabre al no cambiar sus dependencias. `ClinicalEvolutionArtifact.tsx:356` mantiene etapa review.

**Corrección:** autoOpen es política inicial, no capacidad permanente de revisar. En revisión siempre debe existir una salida accesible: reabrir confirmación o continuar editando. Escape jamás aprueba ni descarta implícitamente.

### F06. Fallo transitorio de guardado se presenta como confirmación expirada · P1 · B-S + I

**Impacto:** «Tu borrador se conserva» es cierto para datos base, pero no hay acción local que permita continuar. La UI afirma expiración aunque el fixture conserva acción pending; recargar permite reintentar con éxito.

**Reproducción:** resolver aprobación con fallo HTTP sintético → alerta segura → etiqueta «No disponible / Esta confirmación expiró…», evidencia/copiar como únicas salidas → recargar → confirmar con éxito. [Resultado](evidence/recovery-result.txt), [captura](evidence/save-error.png).

**Causa probable:** `useClinicalAssistant.ts:856–862` agrupa `ACTION_EXPIRED` y `EVOLUTION_SAVE_FAILED` como unavailable; `ClinicalEvolutionArtifact.tsx:309,426` trata failed como terminal. Causa inferida de checkout, síntoma medido en servido.

**Corrección:** distinguir rechazo terminal, error conocido sin guardado y resultado ambiguo. Ante ambigüedad: GET/reconciliar antes de volver a POST; respetar idempotencia, hash y expiración. No habilitar retry indiscriminado ni afirmar expiración sin respuesta canónica.

## Hallazgo acotado y decisiones UX

### F07. Stop y cola: alcance poco evidente · P2 · B-S + O

Stop cancela el turno actual; la cola arranca inmediatamente después y Stop vuelve a aparecer. Comportamiento confirmado, **no incumplimiento técnico demostrado**. [Resultado](evidence/clinical-matrix-result.txt), [captura](evidence/stop-queue.png). Propuesta: label «Detener respuesta actual» y feedback sobre mensajes que siguen pendientes. Decidir si hace falta Pausar cola; no cambiar semántica de Stop silenciosamente.

### F08. Conflicto de cola sin paciente no tiene recuperación directa · P2 · B-S

Una entrada creada con `patientId:null` y un paciente activo distinto bloquea despacho. A diferencia del caso con paciente, no existe «Volver a sin paciente». [Resultado](evidence/clinical-matrix-result.txt). `ClinicalAssistantArea.tsx:638–653` condiciona la acción a `queued[0]?.patientId`. Edición/borrado son vías existentes, pero no equivalen a restaurar contexto. Añadir acción contextual segura según D01, sin reasignar la entrada.

### F09. Densidad y jerarquía inicial · P2 · O

Paciente, Pendientes, Drive y tres starters compiten por atención en viewport estrecho. [360px](evidence/chat-360.png), [1440px](evidence/empty-1440.png). No hubo overflow root ni compositor invisible. Reducir repetición y conservar una acción principal es una propuesta de diseño, no diagnóstico de fallo. No eliminar funciones clínicas ni volver Drive requisito.

### F10. Targets de 40px en modo coarse frente al contrato de 44px · P2 · B-C

CDP touch emulation, `matchMedia('(pointer:coarse)').matches === true`, viewport 360×800: Ver pendientes, Drive, starters y dictado miden 40px de alto; Enviar y Quitar paciente miden 44px. [Medición](evidence/coarse-touch.json). No constituye por sí solo fallo WCAG 2.5.8 (24px mínimo con excepciones); sí queda por debajo del criterio interno de 44px. Corregir selectors/variantes usados por estos controles y verificar responsive sin expandir excesivamente la toolbar.

## Controles que funcionaron

- Drive cerró sin cancelar stream ni perder draft; foco volvió al trigger.
- Separator desktop cambió ancho con teclado; diálogo móvil atrapó foco y Escape devolvió foco.
- Cola respetó límite tres y retuvo cuarta entrada editable.
- Voz denegada conservó texto; voz sintética exitosa respetó selección capturada y ediciones concurrentes, no autoenvió y devolvió foco.
- Error de transporte recuperó respuesta persistida por GET; 403 preservó borrador no enviado.
- Guardado canónico se mostró separado de Drive fallido; el compositor permitió el siguiente envío con texto.
- Historial de 61 grupos: `scrollHeight=13774`; lectura arriba no fue arrastrada al final. Ausencia de jump button sin contenido nuevo debajo no se registra como defecto.
- 70 pruebas focalizadas del checkout pasaron. No contienen necesariamente regresiones para F01–F06.

## Seguridad, arquitectura y rendimiento: límites de conclusión

| Área | Evidencia | Conclusión / siguiente gate |
|---|---|---|
| Ownership SQL | I: consultas owner-scoped, transacción `FOR UPDATE`, hash y expiración en resolve | Buen contrato; no prueba dos usuarios/DB real en esta sesión |
| Aprobación humana | B fixtures + I: modelo prepara; resolve guarda | La propuesta no debe mover save a herramientas autónomas |
| Idempotencia | I: approved/declined y evolución/export intent transaccionales | Exigir tests backend y double-submit UAT; no afirmar exactly-once Drive |
| SSE | B-C transporte recuperado + I runner | Subscriber abort no significa detener cómputo servidor; task registry en proceso no demuestra restart durability |
| Tokens/RUT | I: límites de sanitización y OAuth independiente | No se inspeccionaron credenciales ni probó fuga adversarial real |
| Performance | B: geometría, textarea 144px, 61 grupos estables | Sin LCP/INP/CLS ni presupuesto CPU medido; no asignar fallo por sensación |
| Accesibilidad | B: teclado/foco/targets; detector `[]` | Sin screen reader, auditoría exhaustiva de contraste ni certificación WCAG |
| 401 | B-C: reauth navigation; fixture autenticada redirige a `/patients` | No prueba logout/login real ni recuperación de draft tras sesión expirada |

## Validación pendiente para cerrar hallazgos

Reproducir F02, F03 y F06 también con checkout JS; ejecutar regresiones dedicadas F01–F06; evaluar permisos/ownership/duplicados con dos identidades sintéticas en UAT; verificar Drive `unknown`, reconexión, dirty-save y conflictos reales en documentos desechables. Ninguno de estos pendientes autoriza tocar datos reales.
