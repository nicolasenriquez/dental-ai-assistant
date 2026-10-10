# Crítica UX del Asistente clínico

2026-10-09 · Rama `feat/ai-assisted-evolutions` · Checkout `7345f7a`.

## Veredicto

**Conservar el Quiet Clinical Workbench y corregir continuidad antes de pulir densidad.** El diseño oscuro, el lector Drive opcional y el artefacto clínico inline son adecuados para una consulta odontológica. El problema principal no es que la interfaz parezca antigua: varias transiciones dejan de representar fielmente trabajo, paciente o capacidad de continuar.

El clínico necesita contestar tres preguntas en todo momento: **¿para quién trabajo?, ¿qué sigue sin guardar?, ¿qué puedo hacer ahora?** El header suele responder la primera; el artefacto y los controles pierden precisión al cambiar paciente, navegar con una edición, cerrar revisión o fallar el guardado.

## Procedimiento Impeccable y limitaciones

1. Lectura de producto, diseño, principios UX, surface brief, contratos y código.
2. Inventario de rutas, propiedad y estados ortogonales.
3. Exploración headed con datos sintéticos en cinco viewports.
4. Assessment A guardado [antes del detector](evidence/design-assessment-A.md).
5. Detector ejecutado sobre la superficie: [resultado `[]`](evidence/detector.json).
6. Reproducciones de revisión, errores y concurrencia; contraste con checkout compilado.
7. Shape y slices separados de la auditoría.

No hay herramienta de subagentes disponible: se usó **evaluación secuencial en un único contexto**, no consenso independiente. El detector vacío no invalida los hallazgos ni certifica accesibilidad. Las propuestas opcionales no se presentan como bugs.

## A. Lectura de la interfaz

### Primera impresión y jerarquía

La navegación principal es corta: Pacientes, Asistente y Chat. La identidad del paciente es más importante que el título del hilo y queda cerca de las acciones. Drive empieza cerrado, por lo que no exige entender integración externa para escribir una nota.

En desktop, el transcript tiene una columna legible y el compositor permanece disponible. En 360px, las acciones de header y starters ocupan varios renglones; abrir cola reduce aún más el espacio de lectura. No se observó overflow horizontal root, por lo que la respuesta no debería ser «ocultar todo en móvil». La mejora es asignar una prioridad clara: paciente → trabajo clínico → siguiente acción; herramientas auxiliares después.

### Contenido clínico y estados

El artefacto único con etapas Borrador, Revisión y Guardada evita convertir el chat en una colección de recibos. La exportación Drive se presenta aparte: un guardado canónico no pasa a fallido porque Drive falle. Esto es correcto y debe conservarse.

Sin embargo:

- Un artefacto ligado a paciente puede perder la identidad visible al quitar el paciente del workspace (F03).
- Cerrar confirmación con Escape conserva revisión pero oculta sus controles locales (F05).
- Un error recuperable se comunica como confirmación expirada sin mostrar cómo recuperarse (F06).

No basta con un color de status: las acciones tienen que concordar con ese status.

### Composición y voz

Se conserva texto al cerrar Drive, se evita envío automático de dictado y se inserta una transcripción sintética en la selección capturada respetando texto escrito durante el proceso. El textarea crece hasta 144px y luego hace scroll interno.

La cola agrega otro significado a Enviar/Enter durante streaming. El límite tres está protegido y la cuarta entrada no se pierde. Stop detiene la respuesta actual, no la cola. No es un bug por definición; sí merece explicación visible antes de ofrecer controles nuevos (F07).

### Drive

La separación Notas / Documentos / Diarios representa tres alcances distintos. Selección explícita y chips de contexto evitan que abrir un documento envíe automáticamente su contenido al modelo. El panel desktop se redimensiona con teclado; el sheet móvil atrapa foco y lo devuelve al cerrar.

No se justifica rediseñar Drive como pantalla principal, quitar su opcionalidad, fusionar notas globales y documentos por paciente o convertir un diario en fuente clínica canónica.

## B. Heurísticas de Nielsen

Escala local 0–4: 0 ausencia grave; 1 débil; 2 irregular; 3 buena; 4 consistente en estados revisados. No es una métrica de negocio ni un score completo de la aplicación.

| Heurística | Assessment A | Comentario después de reproducciones |
|---|---:|---|
| Visibilidad del estado | 3 | Actividad/save/Drive están diferenciados; expiración equivocada y review sin trigger restan claridad |
| Lenguaje del mundo real | 3 | Nota clínica, ficha y evolución son términos adecuados; falta precisar alcance de Stop |
| Control y libertad | 2 | Escape seguro en Drive, pero review queda sin salida local; Stop tardío cruza hilo |
| Consistencia | 3 | Columna/artefacto/acciones coherentes; draft y cola usan reglas de paciente distintas |
| Prevención de errores | 2 | Aprobación explícita y cola limitada; cambio contextual de material no enviado insuficiente |
| Reconocimiento | 2 | Paciente visible en workspace; metadata histórica y recuperación pueden desaparecer |
| Eficiencia | 3 | Dictado, selección y cola útiles; no introducir nuevas preferencias para resolver bugs |
| Minimalismo | 3 | Base sobria; redundancia de pendientes y starters es P2, no emergencia |
| Recuperación | 2 | Transporte reconcilia; save transitorio requiere recarga |
| Ayuda contextual | 2 | Necesita ayuda breve para Enter/cola y recuperación, no tutorial global |
| **Total provisional** | **25/40** | Se conserva como registro de A; hallazgos posteriores priorizan, no recalculan un score artificial |

## C. Personas y errores críticos

**Odontólogo interrumpido entre pacientes.** Una nota queda escrita al quitar paciente. El header parece cambiado, pero el contenido sigue siendo del contexto anterior. La solución requiere decisión contextual, no un toast que desaparezca.

**Usuario de teclado.** Puede operar Drive; puede cerrar revisión con Escape, pero no recuperar revisión en la misma vista. La función accesible de cerrar diálogo no debe producir un callejón sin salida.

**Clínico móvil.** Necesita espacio de lectura y targets cómodos. La geometría responsive funciona en emulación; varios controles mantienen 40px incluso con pointer coarse. No se probó teclado físico/virtual real.

**Usuario con conexión inestable.** La reconciliación de transporte funciona con fixture, pero un fallo de aprobación se convierte en terminal local. La UI debe distinguir fallo seguro, incertidumbre y expiración.

## D. Mantener, simplificar, corregir

| Mantener | Simplificar después | Corregir primero |
|---|---|---|
| Diseño oscuro y tokens | Repetición de Pendientes | Scope de Stop y async callbacks |
| Artefacto único inline | Tres starters cuando ya hay texto | Edición local dirty al navegar |
| Aprobación humana | Feedback compacto de cola | Identidad histórica del artefacto |
| Drive cerrado por defecto | Metadata/status repetidos | Escape/reapertura de revisión |
| Guardado y export separados | Labels de teclado/Stop | Recuperación de guardado |
| Selección Drive explícita | Targets/stack móvil | Frontera del cambio de paciente |

## E. No hallazgos y temas pendientes

No se confirma overflow root, cancelación de chat por cerrar Drive, envío automático de voz, duplicación clínica real, fuga entre cuentas, mala calidad del modelo ni incumplimiento global de WCAG. La ausencia de jump button al leer una historia sin contenido nuevo debajo no se califica como bug.

Persistencia de borradores ante recarga, worker durable para turnos, colapso de históricos y virtualización son decisiones separadas. No se agregan a un «rediseño» para resolver pérdida de edición o un callback fuera de scope.

## Prioridad de diseño

Primero hacer confiables las transiciones; después mejorar reconocimiento de contexto y recuperación; por último compactar lo que compite visualmente. [Shape](05_ASSISTANT_UX_SHAPE_PROPOSAL.md) define el alcance, y [plan](06_ASSISTANT_IMPLEMENTATION_PLAN.md) separa los slices verificables.
