# Evaluación independiente congelada

Esta evaluación se escribió antes de leer propuestas, diseño, tareas o auditorías anteriores. PMAX-001 a PMAX-005 quedan congelados; la reconciliación se registra en otro archivo.

## Score del alcance observado: 71/100

Es una valoración editorial del subconjunto recorrido, no un certificado de accesibilidad, seguridad clínica ni calidad de todo el producto. No se asignan puntos por flujos de escritura o recuperación no probados.

| Dimensión | Peso | Puntos | Evidencia y límite |
| --- | ---: | ---: | --- |
| Jerarquía visual | 15 | 12 | Identidad clara; encabezado muy alto con nombres largos |
| Listados y densidad | 15 | 9 | Tabla de Patients clara; evoluciones e hilos difíciles de distinguir |
| Navegación | 15 | 12 | Enlace de evolución abre el registro; búsquedas disponibles |
| Eficiencia de consulta | 10 | 7 | Comparar evoluciones requiere abrir detalles; no se puntúa aprobación |
| Consistencia | 10 | 8 | Controles y lenguaje coherentes en las páginas recorridas |
| Responsive | 10 | 6 | Sin overflow global; solapamiento del aviso de Drive en móvil |
| Accesibilidad parcial | 10 | 7 | Nombres accesibles y retorno de foco; enlaces repetidos |
| Feedback observado | 5 | 4 | Vacío, carga y error de pendientes comprensibles |
| Carga cognitiva | 10 | 6 | Repetición de títulos/fechas y espacio previo al listado móvil |
| Total | 100 | 71 | Solo cobertura documentada en inventario |

## Hallazgos

### PMAX-001: Evoluciones con fecha coincidente no se distinguen en la lista

- AREA: Listados del Asistente.
- SCREEN: `/a/audit-thread`, resultado Evoluciones consultadas.
- USER GOAL: Elegir una evolución concreta sin abrir varias fichas.
- OBSERVED BEHAVIOR: Doce registros con IDs distintos y misma fecha/minuto producen doce enlaces visibles y accesibles idénticos. La ficha de destino sí diferencia las evoluciones por resumen. El enlace probado abre el primer registro correcto.
- EXPECTED BEHAVIOR: Cada destino se distingue visualmente y por su nombre accesible, sin inventar información clínica.
- EVIDENCE: `assistant-1440.png`, `assistant-390.png`, `evolution-destination.png`, `browser-matrix-result.json`.
- VIEWPORT: 1440, 1024, 768, 390 y 360 x 900 CSS px.
- SOURCE/BROWSER: Playwright CLI sintético; `EvolutionListResult.tsx` y `clinical_assistant/service.py`.
- SEVERITY: P2.
- USER IMPACT: Prueba y error para seleccionar registros de una misma fecha, especialmente al recorrer enlaces con lector de pantalla.
- ROOT CAUSE: SOURCE-CONFIRMED. El renderer usa solo fecha para el texto; el backend reduce el payload a ID y fecha. Los previews añadidos a la fixture se ignoran y NO forman parte del contrato actual.
- CONFIDENCE: Alta para reproducción de fechas coincidentes; frecuencia real NOT VERIFIED.
- INITIAL RECOMMENDATION: Identificación ordinal dentro del resultado, visible y accesible, manteniendo fecha y deep-link. No presentar el ordinal como identificador clínico permanente. Resúmenes clínicos serían una mejora futura que requiere cambiar el contrato y queda fuera de esta autorización.

### PMAX-002: Hilos con título y minuto coincidentes se ven iguales

- AREA: Historial del Asistente.
- SCREEN: Sidebar a 1440 x 900.
- USER GOAL: Retomar la conversación correcta.
- OBSERVED BEHAVIOR: Tres hilos sintéticos con título genérico y timestamp iguales, pero previews distintos, aparecen con el mismo título y fecha. Las fechas ayudan cuando son distintas, como en la sesión nativa.
- EXPECTED BEHAVIOR: Una pista adicional distingue conversaciones sin obligar a abrirlas todas.
- EVIDENCE: `assistant-1440.png`, `targeted-checks-result.json`; fixture con `preview` diferente por hilo.
- VIEWPORT: 1440 x 900 CSS px.
- SOURCE/BROWSER: CLI sintético; `ClinicalThreadList.tsx`, `ClinicalThreadSummary`.
- SEVERITY: P2.
- USER IMPACT: Se pierde tiempo recuperando contexto cuando el usuario no renombra sus conversaciones.
- ROOT CAUSE: SOURCE-CONFIRMED. El modelo de lista usa título, fecha y estado; no muestra `preview` ya disponible. No se verificó que el preview sea apropiado para mostrar contenido clínico en sidebar.
- CONFIDENCE: Alta sobre indistinguibilidad; media sobre conveniencia del preview.
- INITIAL RECOMMENDATION: Revisar una pista secundaria segura reutilizando `ConversationRow`. No exponer identificadores ni introducir títulos clínicos generados para resolverlo.

### PMAX-003: El botón móvil cubre el aviso de Drive desconectado

- AREA: Shell compartido y onboarding de Drive.
- SCREEN: Asistente con Drive desconectado a 390 px.
- USER GOAL: Entender el estado de Drive y abrir la navegación.
- OBSERVED BEHAVIOR: El botón Abrir navegación se dibuja encima del inicio del aviso Google Drive no está conectado. En Patients se reserva espacio por encima del banner, lo que evita el mismo solapamiento en la captura estable.
- EXPECTED BEHAVIOR: Navegación y aviso se leen sin superponerse.
- EVIDENCE: `targeted-mobile.png`, `targeted-checks-result.json`, `patients-mobile.png`.
- VIEWPORT: 390 x 900 CSS px, móvil emulado.
- SOURCE/BROWSER: CLI sintético; `AppShell.tsx`, `DriveBootstrapBanner.tsx`.
- SEVERITY: P2, visual con impacto en lectura.
- USER IMPACT: El comienzo del mensaje de estado queda tapado; el control conserva tamaño 44 x 44.
- ROOT CAUSE: SOURCE-CONFIRMED en composición. Botón en (12,12), 44 x 44; primer párrafo del banner en (15,11.25), 360 x 18.75. Sus cajas se intersectan. No se atribuye un fallo OAuth.
- CONFIDENCE: Alta en estado desconectado sintético; no observado en sesión nativa conectada.
- INITIAL RECOMMENDATION: Reservar espacio en el shell para el botón o el banner. Ownership compartido; no cambiar OAuth ni el contenido de documentos.

### PMAX-004: Identidad larga ocupa una parte grande del encabezado móvil

- AREA: Contexto y composición del Asistente.
- SCREEN: Encabezado con nombre sintético largo y Drive desconectado.
- USER GOAL: Leer resultados manteniendo el paciente visible.
- OBSERVED BEHAVIOR: El selector mide 116.58 px de alto; la transcripción empieza en y=369.83 y dispone de 438.17 px antes del composer en viewport de 900 px.
- EXPECTED BEHAVIOR: Identidad legible sin desplazar en exceso el contenido principal.
- EVIDENCE: `assistant-390.png`, `targeted-checks-result.json`.
- VIEWPORT: 390 x 900 CSS px; comparación 360, 768, 1024 y 1440.
- SOURCE/BROWSER: CLI sintético; `ClinicalPatientPicker.tsx` y encabezado compartido.
- SEVERITY: P2, composición. No se observó pérdida de contenido por overflow global.
- USER IMPACT: Más scroll para revisar una lista; combinación de nombre largo, aviso y utilidades.
- ROOT CAUSE: OBSERVED. El nombre se ajusta a varias líneas, encima de una segunda fila de utilidades. No se ha aislado qué parte conviene compactar sin reducir legibilidad.
- CONFIDENCE: Alta en geometría; media en recomendación.
- INITIAL RECOMMENDATION: Evaluar disclosure del contexto y jerarquía de utilidades. Preservar acceso al nombre completo y al paciente correcto.

### PMAX-005: Mucho contenido precede al primer paciente en móvil

- AREA: Patients, filtros y listado.
- SCREEN: `/patients` con Drive desconectado.
- USER GOAL: Encontrar y abrir un paciente.
- OBSERVED BEHAVIOR: Aviso, título, acción de creación y filtros apilados llevan el primer registro aproximadamente a y=660 en 390 x 844. Las filas móviles sí envuelven nombres largos y conservan sus enlaces.
- EXPECTED BEHAVIOR: Equilibrio entre filtros visibles y acceso al listado.
- EVIDENCE: `patients-mobile.png`, `patients-desktop.png`.
- VIEWPORT: 390 x 844 y 1440 x 900 CSS px.
- SOURCE/BROWSER: CLI sintético; `Patients.tsx`, `PatientDirectoryResults.tsx`.
- SEVERITY: P3, oportunidad de densidad; no falla funcional.
- USER IMPACT: Poco listado visible inicialmente en la condición desconectada.
- ROOT CAUSE: OBSERVED. Todos los filtros y aviso están expandidos. La muestra de dos pacientes no prueba un problema de rendimiento o paginación.
- CONFIDENCE: Alta para captura; media para beneficio de compactación.
- INITIAL RECOMMENDATION: Investigar filtros secundarios bajo disclosure en una futura revisión de Patients. No sustituir la tabla de desktop por cards.

## Fortalezas que preservar

1. Patients usa una tabla semántica en desktop y enlaces amplios con nombres legibles en móvil.
2. El enlace de evolución mantiene el patient ID y abre el registro seleccionado en la ficha.
3. Escape cierra el selector y devuelve foco a Cambiar paciente activo; Drive devuelve foco a Abrir Google Drive.
4. Vacío y error de pendientes son estados distintos; el error ofrece Reintentar.
5. Las capturas estables no muestran overflow horizontal global a 360, 390, 768, 1024 o 1440 px.

## Quick wins y oportunidades mayores

Un ordinal para evoluciones coincidentes y una separación de banner/navegación son cambios locales candidatos. Una pista de conversación requiere revisar privacidad y reglas de título. Resúmenes clínicos en resultados, filtros móviles y cambios estructurales de encabezado requieren evaluación de su alcance. Ninguna recomendación autoriza implementación.

## Journeys observados

```text
Asistente con 12 enlaces iguales
  -> elegir primera fecha [1 click]
  -> ficha / Clínica / Evoluciones [1 cambio de pantalla]
  -> detalle del registro correcto
  -> comparar resumen con otros registros en ficha
```

La dificultad para elegir otro registro desde la lista es observada; no se midió tiempo de tarea con usuarios.

```text
Asistente -> Cambiar paciente activo -> selector con búsqueda enfocada
          -> Escape -> vuelve foco al trigger [0 escrituras]
Asistente -> Abrir Google Drive -> panel desconectado
          -> Escape -> vuelve foco al trigger [0 OAuth]
Pendientes -> vacío; respuesta 503 sintética -> error con Reintentar
```

## Límites y exclusiones

No se verificó accesibilidad WCAG completa, métricas con usuarios, teclado en todos los controles, zoom 200% real ni flujos clínicos mutantes. El error de Diagnóstico con fixture incompleta se excluye. Las recomendaciones se basan en datos sintéticos y lectura acotada del runtime nativo. No se atribuye a las auditorías anteriores la omisión de ninguno de estos puntos hasta completar reconciliación.
