# Shape: continuidad clínica confiable

**Propuesta pendiente de aprobación.** No cambia contratos por sí sola ni autoriza implementación.

## Problema y resultado buscado

Durante una consulta, el clínico alterna pacientes, escribe, consulta Drive y revisa un borrador. Hoy algunos cambios de superficie pierden buffers o eliminan la siguiente acción. Un callback tardío de Stop incluso altera otro hilo.

Resultado: **cada trabajo conserva contexto, texto e identidad; cada estado ofrece una salida segura; guardar en ficha y exportar siguen separados.** No se busca otra estética ni convertir Asistente en wizard.

## Appetite y límites

Appetite propuesto: un ciclo acotado dedicado primero a seis fallos de continuidad, entregado en PRs pequeños con regresión. Validar capacidad y estimación después de decidir D01–D03; no prometer duración a partir de esta auditoría.

**Must-have:** F01–F06; frontera contextual consistente; historial de paciente estable; salidas de revisión y error.

**Should-have:** recuperación del conflicto null en cola y claridad de Stop; targets coarse 44px.

**Could-have:** compactar starters/header y reducir repetición de estados cuando los gates funcionales pasen.

**Fuera:** rediseño Pacientes/odontograma, planes en Pacientes (D04), nuevo store, component catalog, tema nuevo, APIs de modelo nuevas, autosave clínico sin aprobación, exportación de borradores, OAuth/settings globales, worker durable como parte del polish, sincronización bidireccional Drive y virtualización sin medición.

## D01. Una frontera para cambiar paciente con trabajo

**Propuesta:** antes de cambiar/quitar paciente, evaluar trabajo no enviado, adjuntos contextuales, cola y edición local del artefacto. No trasladar ese contenido automáticamente al nuevo paciente.

```text
Cambiar/quitar paciente
  ├─ Sin trabajo contextual: permitir
  ├─ Voz activa: terminar/cancelar voz con regla existente
  └─ Trabajo contextual: decisión explícita
        ├─ Seguir con paciente actual
        ├─ Conservar trabajo ligado al contexto anterior
        └─ Descartar trabajo, luego cambiar (acción destructiva explícita)
```

**Pregunta de producto:** ¿se permite una nota deliberadamente global sin paciente dentro de la misma conversación? Si sí, el usuario debe elegirlo; no se infiere del contenido. No usar «Mover al nuevo paciente» como acción primaria. Cola null debe poder volver a contexto sin paciente mediante la misma política.

**Breadboard:** paciente permanece visible cerca del título; el compositor muestra un aviso compacto solo cuando trabajo y contexto difieren. Un diálogo existente de transición dirty pide decisión cuando el cambio puede recontextualizar material. No nuevo modal por cada tecla ni toast como única protección.

## D02. Identidad del artefacto independiente del workspace

El artefacto muestra paciente histórico, fecha, fuente y estado a partir de su identidad persistida. Cambiar paciente del header no modifica su contenido ni su destino. Si faltan datos de paciente, no mostrar un artefacto «sin paciente» falsamente: usar estado de información no disponible y bloquear aprobación hasta resolver contexto con el contrato existente.

No persistir un view-model visual. No duplicar patient state global. Evaluar si payload actual ya resuelve metadata antes de proponer un campo/API.

## D03. Trabajo local editable y revisión sin callejones

```text
Borrador
  └─ Editar campo → buffer local dirty
       ├─ Aplicar → actualizar draft/autosave existente
       ├─ Cancelar edición → decisión explícita
       └─ Navegar → preservar o confirmar descarte

Revisión
  ├─ Confirmar guardado → diálogo explícito
  ├─ Seguir editando → borrador existente
  └─ Escape/cerrar diálogo → revisión con triggers visibles
```

Separar `autoOpen` inicial de `canOpen`. Escape nunca aprueba, descarta ni deja revisión sin CTA. Buffer dirty debe guardar identidad de artefacto/campo y sobrevivir navegación interna hasta aplicación/descarte. No implica persistir texto sensible en localStorage ni supervivencia a recarga.

## D04. Error de guardado no equivale a expiración

La UI debe reflejar estado canónico y ofrecer acción compatible:

| Estado observado | Mensaje y acción |
|---|---|
| Guardado confirmado | Guardada en ficha; Ver en ficha; Drive separado |
| Error conocido sin guardado, acción aún válida | No pudimos guardar; conservar contenido; reintento seguro según backend |
| Resultado incierto | No pudimos confirmar; verificar/hidratar primero; no doble POST ciego |
| Acción realmente expirada | Expiró esta confirmación; volver a preparar revisión sin perder draft |
| Rechazo/decline canónico | Acción terminada; crear/revisar draft mediante flujo autorizado |

La distinción `failed`/`unknown` Drive sigue intacta. No crear exactamente-once remoto por etiqueta ni usar reloj frontend para declarar stale syncing.

## D05. Semántica visible, no controles innecesarios

- Label de Stop: «Detener respuesta actual». Si hay cola: «Hay N mensajes pendientes» con acciones existentes para editar/eliminar.
- Mensaje de límite: explicar máximo tres y mantener cuarta entrada en compositor.
- Ayuda compacta de Enter/Shift+Enter y de enqueue durante respuesta; no onboarding obligatorio.
- Decidir Pausar cola solo si usuarios necesitan detener todo el trabajo; no implementarlo como efecto secundario de Stop.

## D06. Densidad y targets después de continuidad

En móvil, mantener paciente y compositor, compactar herramientas auxiliares y quitar starters cuando dejan de aportar (por ejemplo cuando ya hay texto). Pendientes debe tener una entrada principal consistente; no retirar sidebar sin verificar rutas alternativas.

Targets coarse de 44px usando variants/tokens existentes. No confundir con el mínimo WCAG de 24px. Mantener una acción principal por etapa y controles secundarios accesibles, no hover-only.

Conservar flat workspace, bordes sutiles, typography y semantic colors. No cards anidadas, dashboards de status, sombras nuevas, lifecycle interactivo ni animación de altura del transcript. Reduced motion conserva foco/estado inmediato.

## Riesgos y rabbit holes

1. **Transiciones demasiado amplias:** bloquear cambios con cualquier nota global puede molestar. Resolver D01 antes de codificar.
2. **Buffer persistido inapropiadamente:** texto clínico en almacenamiento durable del navegador exige política de privacidad; no necesario para navegación interna.
3. **Retry que duplica:** no habilitar botón sin reconcile/canonical state; conservar hash, idempotencia y expiración del backend.
4. **Focus trap duplicado:** reutilizar primitive existente y su propiedad de foco; evitar dos diálogos superpuestos.
5. **Refactor de runtime gigante:** corregir ownership de callbacks con identidad, no rehacer reducer/SSE/arquitectura.
6. **API nueva para metadata sin necesidad:** explorar payload/repositorio existente primero.
7. **Density que esconde seguridad:** no colapsar el artefacto actual ni ocultar paciente, source o recuperación necesaria.
8. **Auditoría confundida con integración real:** mock pass no cierra gates OAuth, DB, ownership ni Drive.

## Criterios de aceptación del pitch

- Cancel A tardío no aborta controller B ni borra transcript B.
- Editar sin Aplicar y navegar conserva buffer o requiere descarte consciente.
- Quitar/cambiar paciente con trabajo contextual nunca cambia su vinculación silenciosamente.
- Artefacto conserva identidad de paciente al modificar workspace.
- Escape deja triggers visibles y foco útil; revisión sigue operable con teclado.
- Error transitorio ofrece recuperación compatible con estado canónico; incertidumbre verifica antes de escribir.
- Guardada en ficha permanece guardada aunque Drive falle; siguiente nota disponible.
- Cinco viewports sin root overflow; coarse targets 44px; dialog/resize/voice/queue regressions intactas.

Implementación propuesta en [06](06_ASSISTANT_IMPLEMENTATION_PLAN.md). Aprobar este pitch no elimina los gates de UAT ni autoriza usar datos reales.
