# Inventario de flujos y estados del Asistente

Fecha: 2026-10-09 · Checkout `7345f7a2e762220a19c638709e85d1b92ca70fed` · Auditoría sin implementación.

## 1. Superficies y navegación

| Superficie | Entrada / salida | Propietario principal | Riesgo que debe conservarse visible |
|---|---|---|---|
| Asistente global | Navegación Asistente → `/a` → `/a/:threadId`; nueva conversación; historial; Pendientes | `pages/ClinicalAssistant.tsx`, `ClinicalRuntimeProvider` | Cada conversación tiene paciente, texto, adjuntos, cola y turno independientes |
| Ficha de paciente | `/patients/:patientId` → asistente contextual → continuar en Asistente | `PatientDetail`, `ContextualAssistant`, `useContextualAssistant` | El paciente de ficha no puede inferirse desde texto clínico |
| Composición | Texto, dictado, instrucciones iniciales, adjuntos de Drive | `ClinicalAssistantArea`, `ClinicalComposer`, `useVoiceDictation` | Escribir/insertar/dictar no equivale a enviar |
| Transcript | Historia, actividad, respuesta SSE, borrador, revisión, resultado | `ClinicalTranscript`, `ClinicalEvolutionArtifact`, `useChatAutoFollow` | Un artefacto conserva identidad y posición; historia no debe forzar seguimiento |
| Revisión | Editar campo / nota fuente → aplicar → revisar → confirmar | `EvolutionReviewArtifact`, `ApprovalRequestItem`, hook clínico | El contenido preparado y el aprobado no son intercambiables |
| Drive | Cerrado por defecto; panel desktop; diálogo/sheet tablet/mobile | `DriveWorkspace`, `DriveDocumentWorkspace` | Cerrar Drive no cancela chat ni descarta nota |
| Exportación | Evolución canónica guardada → estado Drive independiente | Hook clínico, `evolution_exports/service.py` | Un fallo Drive nunca convierte una evolución guardada en no guardada |

## 2. Estados ortogonales, no un único booleano «ocupado»

```text
Conversación: {threadId, activePatient, hydration, activeTurn}
Compositor por conversación: {text, attachments, queue[0..3]}
Voz: idle → requesting → recording → transcribing → idle/error
Turno: idle → submitting → streaming → reconciling → terminal
Artefacto: draft → review → saving → saved
Aprobación persistida: pending | approved | declined | expired | failed
Drive: closed/open × disconnected/loading/ready/error × dirty/clean
Exportación: null | pending | syncing | synced | failed | unknown
```

`Guardar en ficha` requiere aprobación humana explícita. `unknown` de Drive significa resultado remoto ambiguo, no fallo seguro ni permiso para repetir una escritura. El cierre del lector no debe modificar ninguna de las otras máquinas.

### Propiedad actual y puntos débiles

- `ClinicalRuntimeProvider` mantiene texto/adjuntos/cola en memoria por conversación. Esta protección no promete supervivencia a recarga, cierre de pestaña o reautenticación.
- `useClinicalAssistant` mantiene hidratación, stream y acciones. Muchas acciones capturan `scope`; Stop no aplica el mismo guard en todos sus callbacks asíncronos (F01).
- El paciente activo es contexto del workspace; el paciente de un artefacto es identidad histórica. La presentación confunde ambos cuando desaparece el paciente activo (F03).
- El campo todavía no aplicado vive en estado local de `EvolutionReviewArtifact`, separado del borrador y del guard de navegación (F04).
- La visibilidad del diálogo de aprobación es local; `autoOpen` participa también en ocultar controles de recuperación (F05).

## 3. Journey objetivo frente al observado

1. **Entrar desde ficha o Asistente.** Identificar paciente y conversación antes de redactar. La apertura contextual sintética conserva el paciente.
2. **Redactar.** Texto, dictado y selección de Drive alimentan un solo compositor. La voz no autoenvía; selección exige acción explícita.
3. **Enviar.** Se observa actividad y respuesta; se puede seguir escribiendo o encolar hasta tres entradas.
4. **Preparar borrador.** El artefacto conserva paciente, procedencia y cuerpo. La hidratación de fixture verifica UI; no prueba calidad del modelo.
5. **Editar.** Aplicar cambios funciona como frontera local, pero abandonar un campo sin aplicar pierde su buffer.
6. **Revisar.** Confirmación humana separada del envío. Escape cierra sin aprobar, pero oculta la salida local de ese estado.
7. **Guardar.** Éxito canónico permite continuar. Fallo transitorio conserva datos, aunque elimina la recuperación local.
8. **Exportar opcionalmente.** Drive puede fallar después del guardado; se muestran estado y Reintentar separados.
9. **Cambiar contexto.** La cola compara paciente; el borrador no enviado y los adjuntos no ofrecen la misma frontera explícita al quitar paciente.
10. **Volver.** Hidratación puede recuperar revisión o aprobación; no debería ser la vía ordinaria para salir de un error recuperable.

## 4. Catálogo operativo A01–A24

Esta tabla operacionaliza los escenarios para trazabilidad de esta auditoría; el estado y sus límites están en [04](04_PLAYWRIGHT_E2E_REPORT.md) y [08](08_ASSISTANT_E2E_COVERAGE.md).

| ID | Flujo / transición |
|---|---|
| A01 | Entrada autenticada y navegación al Asistente |
| A02 | Nuevo hilo y estado vacío orientado a nota clínica |
| A03 | Selección y visualización de paciente |
| A04 | Cambio/eliminación de paciente con trabajo no enviado |
| A05 | Composición larga y preservación al abrir/cerrar Drive |
| A06 | Envío y recepción de un stream sintético |
| A07 | Cambio de conversación y respuesta asíncrona tardía |
| A08 | Cola, límite de tres y conservación de cuarta entrada |
| A09 | Stop y continuación de la cola |
| A10 | Cola con discrepancia de paciente, incluido paciente nulo |
| A11 | Dictado: permiso denegado y error seguro |
| A12 | Dictado: éxito, edición concurrente y foco |
| A13 | Drive: desktop, sheet móvil, teclado, cierre y draft |
| A14 | Selección explícita de texto Drive y adjunto |
| A15 | Borrador clínico persistido/hidratado y procedencia |
| A16 | Edición, revisión, Escape y recuperación de controles |
| A17 | Aprobación y resultado canónico guardado |
| A18 | Fallo transitorio de guardado y recuperación |
| A19 | Guardado exitoso con exportación Drive fallida |
| A20 | Error de transporte, reconciliación y 403 |
| A21 | Sesión 401 y reautenticación |
| A22 | Historial largo, lectura sin seguimiento forzado |
| A23 | Asistente contextual desde ficha |
| A24 | Responsive, teclado, foco, movimiento reducido y targets |

## 5. Contratos preservados y exclusiones

- `PRODUCT.md`, `DESIGN.md`, principios UX, surface brief clínico y OpenSpec tienen prioridad sobre esta propuesta.
- Pacientes/odontograma no se rediseñan. Se conserva D04 del audit de Pacientes: no se reintroducen referencias visuales a planes en Pacientes.
- No se prueban modelos reales, calidad diagnóstica, escrituras reales, OAuth real, SQL real, identificación de pacientes reales ni Drive personal.
- No se añade store global, API, migración ni primitive durante la auditoría. Una decisión futura de durabilidad de buffers exige análisis de privacidad antes de persistirlos.
