# Emil: revisión de ejecución e interacción

Se aplicaron las reglas de emil-design-eng y review-animations en modo read-only. Las recomendaciones conectan feedback y frecuencia de uso. Ninguna animación ni cambio CSS se aplicó. La tabla Antes/Después/Por qué es conceptual.

| Superficie / ID | Antes observado | Después propuesto | Por qué y riesgo |
|---|---|---|---|
| Header / R04 | Paciente actual puede ser null mientras el draft pertenece a Ana | Copy del compositor y franja de retorno identifican origen; conservar header como estado actual | Contexto previsible; no fusionar active_patient y draft origin |
| Composer / R03 | Helper nowrap y controles auto dejan textarea de 24.85 px | En panel estrecho, escritura arriba y herramientas debajo; helper secundario adaptable | Dar prioridad a la tarea frecuente; no ocultar Stop/voz ni depender de breakpoint global |
| Guard / R02 | Texto y tres botones sin agrupación; foco en quitar paciente | Decisión inmediata con mantener seguro, conservar explícito y descarte secundario; foco/retorno | Más importante que un efecto visual; evitar default destructivo |
| Stop/Queue | Stop rojo, scope explícito; 3/3 y cuarto texto conservado | Conservar comportamiento y copy; mantener Stop visible al envolver controles | Feedback crítico ya mejorado; no convertir Stop en pausa de cola |
| Artefacto / R08/R09 | h3/h4 fijos, fecha corta | Heading level contextual y fecha/hora consistente | Orientación y comparación de atención; no cambiar valor temporal ni timezone |
| Approval / R06 | Modal preparado + dock visible + artefacto | Dock sólo cuando destino está fuera de vista o revisión necesita recuperación | Reducir duplicación sin perder acceso; no resolver al cerrar modal |
| Drive | Overlay móvil, Split escritorio, cierre devuelve foco | Conservar transición espacial corta y destino estable; no animar texto clínico | Movimiento con propósito; no rehacer estructura ni editar documentos |
| Pendientes / R07 | Reintento recarga primera página | Resultado/estado del ítem sin perder páginas ni foco | Iteración operacional estable; manejar ítems que dejan de ser pendientes |
| Error / R05/R11 | Error duplicado o bienvenida de vacío durante fallo | Un mensaje junto al objeto fallido + acción de recuperación | Baja carga cognitiva; mantener errores distintos visibles |
| Mobile | Controles reflow y navegación separada; queue consume altura | Conservar composer alcanzable, queue bounded/scrollable si contenido crece | No sacrificar texto ni targets por compactación |

## Movimiento, rendimiento y estados

Fuente observada: clinical-item-enter 180 ms ease-out; compositor opacity 200 ms y border/box-shadow 160 ms; indicador clinical-dot-bounce 1.2 s infinite. La barra de cuota usa width 200 ms. Reduced-motion global y excepciones locales existen. DESIGN define reflow desktop inmediato y entrada móvil 180 ms opacity/translate. Eso es autoridad de implementación, no timing de frames medido.

No convertir por sistema todo feedback en spring ni toda actualización en entrada animada. Una tarea clínica repetida exige respuesta rápida y conserva capacidad de interrumpir. No typewriter artificial ni “éxito” antes de persistencia canónica. El nombre bounce no prueba una curva elástica defectuosa; el detector sólo vio el nombre de la animación.

Hover/focus/active se revisaron en fuente del composer: foco con ring, active brightness y controles disable según streaming/voice. En la UI el foco de input y botón Drive es visible, y Escape retorna en review y overlay. El guard queda fuera de ese nivel de ejecución. No se midieron contraste de ring ni todas las variantes de hover con mouse; quedan pruebas de aceptación.

Un resize transitorio produjo capturas de sidebar parcialmente trasladado (22/27/28). Se guardaron como muestras transitorias y se repitieron estados estables (23/37/38). No inferir clipping estable ni jank a partir de un frame de transición. No se midió FPS, INP, CLS, latency o coste de GPU.

## Quick wins y límites

Primero: textarea con ancho útil en panel, botones del guard con variantes y foco, y retry de carga. Después: headings contextuales, mensajes de error con propietario, timestamp consistente. Copy y layout ayudan más que añadir movimiento.

Revisión posterior debe cubrir motion off, teclado, coarse, zoom y lector de pantalla, además de los anchos de contenedor. En esta corrida reduced-motion sólo se inspeccionó en código; no se emuló. No declarar soporte verificado con la inspección de media query.

Preservar por completo: interacción de aprobación humana, buffer del editor, identidad, separación de Drive/ficha, cancelación scope del turno, y clearing de memoria en logout/reload. El polish no puede cambiar estos contratos.

