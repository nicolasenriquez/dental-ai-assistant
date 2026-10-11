# Investigación de UI/UX Pro Max

Se usó `.agents/skills/ui-ux-pro-max/SKILL.md` y su `scripts/search.py`, con el Python ya instalado en `app/backend/.venv/Scripts/python.exe`. El alias Windows `python` no funcionó; no se instaló nada. No se ejecutó `--design-system`, `--persist` ni se creó otra paleta. Las consultas no incluyen datos personales.

## Matriz de investigación

| Hallazgo | Consulta / dominio | Resultado verificado y aplicabilidad | Patrón recomendado / reutilización | Beneficio, trade-off y riesgo |
| --- | --- | --- | --- | --- |
| PMAX-001 | `link purpose repeated dates` / ux; retry `accessible link names` / ux | Primer intento fuera de tema. Retry devuelve ARIA Labels y Essential Text Truncation; el segundo ayuda a preservar nombres completos, pero no cubre específicamente colisiones de fecha. No hay match específico verificado para ese problema. | Conclusión propia: ordinal visible del resultado y nombre accesible coherente; reutilizar `EvolutionListResult`, Link y `formatClinicalDateTime`. | Distingue destinos dentro de una lista; no ofrece información clínica para compararlos. No presentar ordinal como ID permanente ni generar nuevas lecturas. |
| PMAX-002 | `list item distinguish labels` / ux; retry `navigation history labels` / ux | Devuelve principalmente etiquetas de formularios, no identidad de conversaciones. Sin match específico verificado. | Conclusión propia pendiente: revisar pista secundaria segura con `ConversationRow`; no aplicar previews sin revisión de privacidad. | Puede reducir aperturas exploratorias; puede exponer contenido sensible o recargar sidebar. |
| PMAX-003 | `focus not obscured` / ux | Focus Not Obscured Minimum (Web, AA) y Enhanced (Web, AAA). El caso probado oculta texto, no demuestra foco completamente oculto. | Aplicación parcial; reservar espacio para navegación en `AppShell` y el banner actual. | Legibilidad sin colisión; riesgo de alterar altura/scroll de páginas compartidas. No declarar incumplimiento AA por esta captura. |
| PMAX-003 | `sidebar contextual navigation` / ux | El primer resultado es badge contextual, ajeno al problema. El segundo, Sticky Navigation, sí indica compensar el espacio ocupado. | Compensación local de chrome persistente, sin cambiar rutas o onboarding. | Evita solapamiento; necesita regresiones de shell y otros consumidores. |
| PMAX-004 | `information hierarchy disclosure` / ux | Heading Hierarchy aparece como resultado tercero. Es pertinente para estructura, no prueba una solución de compactación. | Mantener identidad completa y headings existentes; evaluar espacio con DE01. | Más espacio de lectura; compactación excesiva puede ocultar el contexto del paciente. |
| PMAX-004 | `responsive overflow label` / html-tailwind | Compact label layout, Icon buttons y Text truncation. El dataset se refiere a Tailwind 4.3; el repo usa 3.4. | Solo principio de flex/wrap y controles sin encoger, con tokens existentes. No copiar recetas versionadas sin verificar. | Reflow predecible; truncamiento por sí solo contradice acceso al nombre completo. |
| PMAX-005 | `responsive table filtering` / ux | Table Handling, Web. Recomienda scroll contenido o adaptación móvil, ambos opciones y no obligación de usar cards. | Preservar `PatientDirectoryResults`: tabla desktop, enlaces móviles. Disclosure de filtros es hipótesis propia. | Mantiene comparación en desktop; filtros ocultos pueden reducir descubribilidad. |
| Fortalezas | `error recovery feedback` / ux | Error Recovery, Error Feedback, Error Messages son pertinentes al 503 y role=alert observados. | Conservar error local con siguiente acción en `ClinicalPendingWork`. | Recuperación comprensible; no extrapolar a guardado clínico no probado. |
| Fortalezas | `button accessible name` / icons | icon-context-accessibility distingue decorativo, significativo e interactivo. | Mantener nombres accesibles y Lucide ya instalado; ignorar recomendación de sustituir librerías. | Semántica clara sin dependencia nueva. |

Se probaron también `readability line height` y el retry `clinical readable typography` en typography. Sus resultados principales fueron estilos de terminal y de marca editorial; no se conservan como autoridad de esta aplicación B2B. No hay recomendación de cambiar las fuentes existentes. Las búsquedas fallidas se registran como limitación, no como evidencia a favor de una solución.

## Referencias primarias externas

La guía de W3C permite establecer el propósito del enlace mediante texto y contexto programáticamente asociado. Sirve como referencia para evaluar nombres de destinos; esta auditoría no certifica un incumplimiento de 2.4.4 solo por fechas repetidas. [W3C, Link Purpose in Context](https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context).

El criterio AA de foco no oculto exige que el componente enfocado no quede completamente cubierto. La ocultación parcial del texto del aviso observada aquí es un problema de composición, no una prueba de ese incumplimiento. [W3C, Focus Not Obscured Minimum](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum).

## Decisión de investigación

La skill respalda principios de semántica, recuperación y contenido que se adapta al espacio. No produjo un patrón específico fiable para identificar evoluciones de igual minuto ni hilos duplicados. Esas dos propuestas son juicio propio sobre evidencia del producto. Los contratos locales prevalecen sobre recomendaciones genéricas, unidades de apps nativas, nuevas librerías o recetas de Tailwind de otra versión.
