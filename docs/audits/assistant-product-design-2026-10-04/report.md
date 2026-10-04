# Auditoría de Assistant con Product Design

Fecha: 4 octubre 2026. Aplicación local actual, navegador nativo de Codex, sesión autenticada. Auditoría combinada de experiencia, diseño y riesgos de accesibilidad. No se modificó código.

## Veredicto

El flujo de recuperar un borrador, editarlo y pasar a confirmación funciona en las interacciones realizadas. La intención clínica es clara y la confirmación evita confundir un borrador con una evolución guardada. La presentación todavía pierde calidad en la cabecera móvil y en la cola de pendientes. No recomiendo rediseñar el asistente: conviene ordenar estas dos zonas y aclarar el contexto de Drive.

Los botones superiores funcionan: Pendientes navega a la cola y Google Drive abre un panel que conserva el hilo. Visualmente no están suficientemente pulidos. Tienen mucho peso en una cabecera ya cargada; Drive coloca icono y texto en distintas líneas, mientras Pendientes mantiene su etiqueta horizontal. En móvil, Volver a ficha se rompe en cuatro líneas y el título del hilo desaparece.

## Recorrido y registro

Todas las capturas siguientes se obtuvieron y se inspeccionaron en esta ejecución. Los tamaños se probaron con el navegador normal, una configuración de escritorio 1440 × 1000 y otra móvil 412 × 900; el último ancho CSS medido fue 374 px por la escala del navegador. No se interpreta el tamaño solicitado como tamaño CSS exacto.

1. **Entrada al asistente. Salud buena con ajustes visuales.** La navegación Asistente abrió un hilo vacío. Se ofrecen paciente o consulta general y el envío vacío está deshabilitado. El estado inicial es comprensible. Cabecera con acciones desiguales.

![01. Inicio](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/01-assistant-start.png)

2. **Abrir Drive, sección Notas. Salud funcional; contexto confuso.** Se abre el panel, muestra Conectado y una fuente existente. Sin paciente activo, el breadcrumb dice Google Drive › Paciente › Notas. Esa palabra sugiere un contexto que aún no se ha seleccionado.

![02. Drive sin paciente](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/02-drive-open.png)

3. **Documentos sin paciente y Diarios. Salud buena en navegación.** Documentos explica que requiere seleccionar paciente. Diarios carga tres semanas y muestra la frecuencia Semanal con explicación de su efecto futuro. No se cambió la frecuencia ni se escribió en Drive.

![03. Diarios](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/03-drive-journals.png)

4. **Pendientes. Salud funcional; identificación insuficiente.** La lista muestra borradores recuperables y errores de Drive. Los textos distinguen que las evoluciones ya están guardadas en ficha. Sin embargo, tres registros del mismo paciente y dos del mismo día carecen de hora, resumen o vínculo visible a la evolución; cuesta saber cuál reintentar. Se abrió Continuar, no Reintentar.

![04. Pendientes](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/04-pending.png)

5. **Continuar borrador. Salud buena.** Recupera el paciente, nota original, cinco campos, estado Borrador y acciones. El contenido sigue editable. El scroll muestra la parte final para llegar al botón principal. No es una pérdida de contenido, pero la tarjeta larga obliga a recorrerla.

![05. Borrador recuperado](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/05-draft.png)

6. **Revisar y guardar; volver a editar. Salud buena en la transición probada.** Se abre confirmación con nombre, fecha/hora y explicación de persistencia. Volver a editar conserva el borrador y devuelve el foco al bloque de evolución. No se ejecutó Guardar evolución. El modal es una confirmación corta, no una segunda vista completa de los campos; esto es coherente si la revisión ocurrió en la tarjeta anterior.

![06. Confirmación](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/06-review.png)

7. **Edición de Hallazgos en escritorio. Salud buena.** Editar abre textarea con Caries.; aparecen Cancelar y Aplicar, y Revisar y guardar queda deshabilitado durante la edición. Cancelar mantiene el valor y devuelve el foco a Editar Hallazgos. No se aplicaron cambios. El espaciado es consistente, aunque la distribución vertical resulta amplia para campos de una frase.

![07. Edición](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/07-edit-desktop.png)

8. **Selector de paciente y búsqueda vacía. Salud buena.** Abre con foco en Buscar por nombre o RUT, señala la selección actual y en una búsqueda sintética sin coincidencias muestra un mensaje y Limpiar búsqueda. Se limpió y cerró con Escape sin cambiar paciente. También se desplegó Ver evidencia; muestra la nota original y Editar nota original.

![08. Selector](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/08-patient-picker.png)

9. **Móvil. Salud del contenido aceptable; cabecera deficiente.** Ancho CSS medido 374 px, scrollWidth 374 px: no se observó overflow horizontal de documento. Los campos se apilan y el compositor sigue disponible. La cabecera da más espacio a Pendientes/Drive que al título/contexto clínico; Volver a ficha se divide en cuatro líneas y Paciente se trunca. El compositor ocupa dos líneas sin desbordar.

![09. Móvil](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/09-mobile.png)

10. **Drive con paciente, Documentos. Salud funcional.** Contexto activo explícito y enmascarado. Se listan documentos y acceso rápido. Con tres documentos, los tres se repiten en ambos bloques, duplicando la lectura. Se abrió un TXT existente; no se importó una copia.

![10. Documentos](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/10-drive-documents.png)

11. **Vista previa del documento. Salud buena en lectura.** El documento carga, tiene Volver, Vista previa/Editar, indicador Guardado y acción Incorporar nota completa al borrador. Se cerró sin editar ni incorporar. Guardado dentro de Drive y Borrador en el hilo representan estados distintos; la diferencia debe ser fácil de entender para evitar confundir guardar un documento con guardar una evolución.

![11. Documento](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/11-document-preview.png)

12. **Buscar conversaciones. Salud buena con pulido pendiente.** La búsqueda filtra, muestra Sin resultados y Limpiar búsqueda restaura la lista. Escape cierra el campo y devuelve el foco a Buscar. En el estado activo hay dos cruces visuales cercanas, una para limpiar y otra para cerrar, sin distinguir su significado a simple vista. Conversaciones/Pendientes en la barra lateral se ven como texto seguido, con selección poco evidente.

![12. Búsqueda](C:/Users/nenri/OneDrive/Desktop/proyectos/pry-ai-evaluator/ai-tutor/docs/audits/assistant-product-design-2026-10-04/12-conversation-search.png)

## Hallazgos priorizados

| Prioridad | Hallazgo y evidencia | Cambio mínimo recomendado |
|---|---|---|
| Alta | Cabecera móvil sacrifica retorno, título e identidad por accesos secundarios. Pasos 5 y 9. | Distribuir retorno/título y paciente en filas claras; mantener Pendientes y Drive en una fila secundaria compacta. Evitar partir etiquetas. Conservar acceso directo. |
| Alta | Pendientes difíciles de distinguir y priorizar; mezcla tareas clínicas y sincronización. Paso 4. | Separar visualmente Borradores/Revisión y Sincronización de Drive, mostrar hora y breve resumen o recurso exacto. Añadir acceso a ficha/evolución en fallos de Drive, preservando Reintentar. |
| Media | Botones de cabecera no comparten composición y tienen peso excesivo. Pasos 1, 7, 9 y 12. | Igualar altura, padding, alineación horizontal de icono/texto y tratamiento secundario. Usar Pendientes como etiqueta corta con nombre accesible descriptivo. Un badge solo si proviene de un conteo real. |
| Media | Drive muestra Paciente sin selección y cambia de alcance entre Notas, Documentos y Diarios. Pasos 2 y 3. | Nombrar el ámbito real: fuentes generales cuando corresponda; explicar cuándo una sección depende del paciente. No modificar el modelo de datos para resolver el texto. |
| Media | Conversaciones/Pendientes no distinguen bien la vista elegida; búsqueda presenta dos cruces similares. Pasos 7 y 12. | Tratamiento seleccionado visible para ambas vistas; diferenciar limpiar y cerrar, con nombres accesibles. |
| Baja | Acceso rápido repite todos los documentos cuando la colección es pequeña. Paso 10. | Evitar el bloque duplicado cuando no reduce el recorrido; conservarlo para conjuntos mayores según el patrón existente. |
| Baja | Campos vacíos ocupan bastante alto y edición de fecha es poco visible. Pasos 7 y 9. | Reducir modestamente el espacio entre filas vacías sin compactar texto largo; reforzar área y descubrimiento del control de fecha. |

## Accesibilidad observada

Fortalezas comprobadas: nombres accesibles para selector, editar cada campo, dictado y Drive; foco visible en búsquedas y textarea; restauración de foco al cancelar edición y al cerrar búsqueda; RUT enmascarado; envío vacío deshabilitado; reflujo del contenido sin overflow horizontal a 374 CSS px.

Riesgos: textos secundarios y botones con borde muy tenue en tema oscuro; verificar contraste medido antes de afirmar incumplimiento. El control Cambiar fecha y hora mide aproximadamente 28 × 28 CSS px en móvil: supera 24 px, pero resulta menor que una zona táctil cómoda de 44 px. Dictado mide unos 40 px de alto y Quitar paciente activo unos 44 px. No se afirma fallo WCAG por estas medidas aisladas. La cabecera móvil y los controles de vista poco distinguibles afectan legibilidad y descubrimiento aun sin overflow.

No se completó auditoría WCAG ni prueba con lector de pantalla; tampoco navegación de teclado exhaustiva, zoom 200/400 %, todos los estados de error ni todos los permisos.

## Límites funcionales y efectos de la auditoría

Se comprobó navegación, listado, recuperación, apertura de edición, cancelación, confirmación y regreso, búsquedas, evidencia y lectura de un documento real de Drive. Eso no certifica generación del modelo, streaming, dictado/transcripción, aplicar ediciones, persistir evolución, exportar/reintentar Drive, importar, incorporación de documentos, conflicto de cambio de paciente o eliminación.

La UI mostró varios fallos de sincronización existentes; no se diagnosticó su causa desde las capturas. Conectado no prueba que toda exportación funcione. No se ejecutaron reintentos ni cambios de frecuencia para evitar escrituras en el Drive conectado durante una crítica visual. No se pidió permiso de micrófono ni se envió información clínica al modelo. La entrada al asistente abrió un hilo vacío; la revisión del borrador cambió temporalmente su estado de revisión y se regresó a edición. No se guardó ninguna evolución ni se aplicaron ediciones. Se restauraron búsquedas y el tamaño del navegador al finalizar.

## Plan recomendado

Primero corregir cabecera y tratamiento de las vistas seleccionadas. Después mejorar identificación y agrupación de pendientes. Por último aclarar alcance de Drive y reducir duplicación de documentos. Reutilizar controles y estilos existentes, conservar URLs, guards, aprobación explícita y separación entre ficha y Drive.

Validar cada cambio con capturas al mismo ancho, navegación de teclado y recorridos sintéticos controlados para guardar/exportar. Investigar por separado los errores reales de Drive antes de prometer que son solo un problema visual.


## Ajustes mínimos implementados

Se corrigió la cabecera mediante el estilo de botones ya existente: se retiró el contenedor intermedio que impedía aplicarlo. En panel estrecho se separan retorno/título, paciente y acciones; el margen del botón de navegación se reserva solo al título. Pendientes conserva su URL y nombre accesible, con etiqueta visual más corta.

La cola agrupa los elementos cargados en Borradores y revisión y Sincronización de Drive, mantiene su orden dentro de cada grupo y su paginación. Muestra hora de actualización y ofrece Ver evolución hacia el UUID exacto en fallos de exportación. No se añadieron resúmenes: la API no los entrega. Las vistas laterales distinguen selección y foco. Drive sin paciente muestra Fuentes generales en Notas; Acceso rápido no duplica colecciones de hasta tres archivos.

Validación: TypeScript y Biome aprobados; 77 archivos / 641 tests frontend aprobados. Nueve recorridos browser aprobados, incluyendo aprobación, persistencia y recuperación de Drive con proveedores simulados. Tras el ajuste final de margen móvil se repitió la prueba de cabecera en 320, 375, 834 y 1440 CSS px: aprobada. Build Docker aprobado y aplicación local reconstruida. git diff --check aprobado. No se modificaron backend, esquema, dependencias ni límites clínicos. No se repitió la suite backend en este cambio exclusivamente frontend.

Verificación nativa Codex: cabecera móvil con identidad y acciones alineadas, pendientes agrupados con hora, documentos sin duplicación; capturas fixed-mobile.png, fixed-pending.png y fixed-drive-documents.png. Se restauró el viewport y se cerró Drive. Sin guardados clínicos ni escrituras externas durante la inspección.

Los errores reales de sincronización siguen siendo un diagnóstico funcional separado; este ajuste conserva su recuperación y acceso al registro guardado. No se creó commit ni push.
