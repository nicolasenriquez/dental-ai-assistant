# Crítica UX

Method: dual-agent (A: `ses_ee67276c4ffeKgg1ibAP5iXnCn` · B: `ses_ee66fca35ffeXH5T7qJ0T0ALC4`).

Assessment A evaluó diseño desde código sin resultados del detector. Assessment B inspeccionó implementación y ejecutó detector. La síntesis incorpora un recorrido propio con Edge visible y Playwright. Las valoraciones estáticas iniciales se corrigieron cuando la ejecución las contradijo.

## Veredicto

La ficha tiene una identidad clínica clara y una base de recuperación mejor que su presentación. FDI, superficie, estado, revisión y autor están modelados. La debilidad está en cómo la UI reúne esas dimensiones: una pieza azul puede representar inspección o un registro histórico enfocado; los procedimientos no muestran siempre su estado real; el catálogo compite con el odontograma y las notas.

No hace falta reconstruir el módulo. Hace falta separar intención transitoria de evidencia guardada, corregir etiquetas de estado y reducir la cantidad de controles equivalentes.

## Salud heurística

Escala Impeccable de 0 a 4. Evaluación profesional, no medida de satisfacción de usuarios. Todas las heurísticas aplican al modo Operate.

| Heurística | Puntuación | Evidencia principal |
|---|---:|---|
| Visibilidad del estado | 2 | F01 muestra `performed` de dos maneras incompatibles; lectura parcial y guardado sí tienen feedback. |
| Correspondencia con mundo real | 3 | FDI y términos clínicos correctos; planificación histórica poco delimitada, F07. |
| Control y libertad | 2 | Hay Cancelar, Cerrar y Deshacer; Escape falla tras perder foco, F02; foco histórico no se limpia, F03. |
| Consistencia | 2 | Categoría y acción usan variantes similares, F06; semántica de estados duplicada, F01. |
| Prevención de errores | 3 | Guards, revisión esperada, confirmación de correcciones y retry congelado. |
| Reconocimiento antes que recuerdo | 3 | Nombres de piezas y superficies; falta distinguir contexto histórico de selección operativa. |
| Flexibilidad y eficiencia | 2 | Aplicación directa y selección libre/rango; reinicio parcial incómodo, F04; catálogo largo, F05. |
| Diseño minimalista | 2 | 29 tarjetas restauradoras, ocho categorías, registros y notas en un mismo recorrido. |
| Recuperación de errores | 3 | Error de lectura recuperado con retry; borrador preservado y descarte explícito. |
| Ayuda contextual | 2 | Instrucciones y leyenda presentes; leyenda usa una variante representativa sin aclararlo, F08. |
| **Total** | **24/40** | **Aceptable; requiere mejoras antes de una experiencia clínica predecible.** |

La puntuación inicial independiente fue 27/40. No es una tendencia histórica: 24/40 es la síntesis después de reproducción, no otra ejecución comparable.

## Qué funciona

- Directorio con búsqueda privada y controles seguros en URL. Lista y ficha mantienen nombres claros, contacto opcional y RUT enmascarado.
- Ficha conserva Resumen, Información, Clínica y Actividad. Nueva evolución tiene precedencia. No aparecen botones de crear planes en Clínica.
- Inspección ordinaria sí tiene `Cerrar pieza`; Escape cierra y retorna foco. Seleccionar y deseleccionar una superficie mediante checkbox funciona sin guardar.
- Correcciones conservan el original, motivo y revisiones. Deshacer usa anotación de error, no borrado físico. Debe preservarse.
- Error de lectura de condiciones no se representa como cero confirmado. Retry vuelve a cargar sin repetir una escritura.

## Problemas prioritarios

1. **F01, P1. Estado clínico contradictorio.** Un procedimiento realizado se presenta como existente en lista y registrado por error en detalle. Corregir presentación en todas sus representaciones antes de pulir el editor.
2. **F02, P1. Escape depende de conservar foco dentro del modal.** Clic en backdrop mueve foco a BODY y el selector sigue abierto tras Escape. El cierre debe pertenecer al diálogo, no depender del último elemento enfocado.
3. **F03, P1. Contexto histórico aparenta selección activa.** Cerrar pieza y pulsar Escape no quitan `aria-pressed=true` cuando hay una condición enfocada por Activity. Separar resaltado de referencia y selección de interacción.
4. **F05/F06, P2. Catálogo largo con poca diferencia entre navegar y actuar.** Ocho categorías y 29 variantes restauradoras no necesitan ocho segmentos más una pared de tarjetas. Mantener categorías, cambiar su jerarquía y filtrar variantes.
5. **F07, P2. Historia de planes parece categoría vigente.** Preservar enlaces y eventos, pero agruparlos como históricos y explicar que la lectura no reabre planificación.

Detalles y pruebas en [auditoría técnica](02_TECHNICAL_UX_AUDIT.md). Direcciones recomendadas: Impeccable harden para F01/F02, clarify para F03/F07, distill para F05/F06 y Shape antes de cambios visuales.

## Carga cognitiva

| Control | Evaluación |
|---|---|
| Un foco por región | Falla en diagnóstico: chart, catálogo, registro y nota compiten. |
| Agrupación | Parcial: agrupaciones por pieza útiles; familias del catálogo no están explicitadas. |
| Jerarquía | Parcial: encabezados claros, controles de categoría y herramienta demasiado próximos en estilo. |
| Una decisión por vez | Parcial: diagnóstico simple es directo; alcance múltiple añade modo, miembros y roles. |
| Opciones mínimas | Falla en restauradora: 29 tarjetas visibles en un grupo. |
| Memoria de trabajo | Riesgo en selección por rango y puentes; el listado de seleccionadas ayuda. |
| Divulgación progresiva | Cumple para corrección e historial; catálogo largo aún abierto. |
| Contexto suficiente | Falla al interpretar selección histórica y estado `performed`. |

No aplicar mecánicamente un límite de cuatro opciones a 32 dientes anatómicos. La anatomía es agrupación reconocible. El problema está en decisiones sin agrupación semántica, no en el número absoluto de dientes.

## Personas y aprendizaje

**Odontólogo en consulta.** Necesita reconocer hallazgo, pieza, superficie y estado sin revisar varios lugares. F01/F03 pueden cambiar su interpretación de evidencia. Mostrar el mismo estado en gráfico, lista y detalle es requisito clínico.

**Usuario experto.** Aplicación directa ahorra pasos; debe conservarse conforme a D03. Para corregir un rango accidental necesita reiniciar selección sin volver a elegir herramienta. No añadir una confirmación universal a cada registro.

**Usuario de teclado.** Botones y checkbox tienen nombres útiles. F02 rompe salida predecible después de un clic externo; F12 no coloca foco al llegar a detalle de nota/plan.

**Usuario móvil.** Hay cuadrantes y targets táctiles. El odontograma horizontal seguido por controles equivalentes ocupa bastante altura; el botón flotante Notas invade visualmente una tarjeta restauradora en `catalog-390.png`. Solapamiento parcial observado, no bloqueo funcional demostrado.

## Experiencia de consulta

Ingreso y apertura de ficha son claros. La incertidumbre aparece al entrar en diagnóstico y elegir una herramienta: el mismo gesto puede consultar, abrir superficies o escribir, según contexto. Instrucción actual existe y ayuda; debe reforzarse junto a la acción y sin convertir el gráfico en formulario.

La salida ordinaria termina bien. La salida desde una referencia histórica termina con una pieza todavía marcada. El final de la interacción necesita distinguir "consulta cerrada" de "referencia histórica visible".

## Equivalencia de skills y límites

Versión instalada expone un solo skill `impeccable`, con playbooks `reference/critique.md`, `audit.md` y `shape.md`. Se usaron esas instrucciones, no nombres de comandos asumidos. El brief persistido `patient-workspace.md` es evidencia previa de Document; no se regeneró DESIGN.md.

Detector CLI retornó `[]`, cero reglas y ubicaciones. No demuestra ausencia de problemas de foco, estado o dominio. No se inyectó overlay ni se inició live-server; la evidencia de navegador procede de DOM, snapshots y capturas propias. Esa parte del playbook queda parcial. No se afirma certificación WCAG.

El archivo solicitado sirve como snapshot documental de esta crítica. No se duplicó en `.impeccable/critique`; no hay trend del storage helper. Prioridad, audiencia, alcance y estilo ya están definidos por el encargo. Las únicas decisiones abiertas se registran en [Shape](05_UX_SHAPE_PROPOSAL.md), para confirmación antes de implementar.
