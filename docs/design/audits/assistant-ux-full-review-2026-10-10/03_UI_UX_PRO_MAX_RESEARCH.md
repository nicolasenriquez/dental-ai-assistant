# UI/UX Pro Max: investigación pertinente

Se leyó la instalación local y se consultó su biblioteca mediante .agents/skills/ui-ux-pro-max/scripts/search.py con el Python existente de app/backend/.venv/Scripts. No hubo instalación, --design-system ni --persist. Se contrastó cada recomendación con React 18.3, Tailwind 3.4, DESIGN y primitivas existentes. El dataset es orientación, no autoridad clínica ni verificación de estándares.

## Matriz de investigación

Las preguntas concretas se expresan en la columna Finding/pregunta. Consultas de 2–5 palabras y -n 2. --domain ux salvo donde se especifica stack. Sólo las recomendaciones juzgadas pertinentes se registran como resultados utilizables; se documentan las búsquedas vacías y los descartes sin convertirlos en requisitos.

| Finding / pregunta | Query | Resultado pertinente | Aplicabilidad | Patrón actual → mínimo recomendado | Beneficio esperado | Riesgo |
|---|---|---|---|---|---|---|
| R02 ¿cómo entrar y salir de la decisión? | keyboard focus modal | Focus States; Focus Not Obscured Enhanced | Foco sí; Enhanced es AAA | Foco externo → foco en decisión, retorno controlado | Teclado previsible | Encerrar foco en un falso modal |
| R02 ¿cómo hacerlo en React actual? | focus trap dialog --stack react | Manage focus properly | Principio transferible; dataset React 19.2 | Div alertdialog → AlertDialog existente del repo | Menos código de foco propio | Adoptar APIs 19 en React 18 |
| R03 ¿cómo conservar lectura al estrechar? | compact input responsive width → responsive content reflow | Retry: Text Reflow and Spacing; Horizontal Scroll | Web pertinente; no overflow no prueba utilidad | Toolbar auto/nowrap → textarea en fila propia según ancho contenedor | Escritura usable en panel/Sheet | Basarse sólo en viewport |
| R03 ¿qué regla de implementación coincide? | textarea responsive grid → grid min width shrink --stack html-tailwind | Compact label layout; shrink shorthand | Sólo principio, dataset Tailwind 4.3; no solución exacta al textarea | Wrapping de grupos/controles con ancho reservado; reuse shell | Adjuntos/control legibles | Copiar sintaxis/versiones o reducir textarea |
| R04 ¿cómo representar origen clínico? | clinical approval confirmation | Confirmation Messages; Confirmation Dialogs | Genérico, sin evidencia clínica B2B específica | Paciente actual null → etiqueta de origen retenido, envío sigue bloqueado | Evitar interpretación general | Hacer el borrador enviable al paciente nuevo |
| R05/R11 ¿cómo recuperar sin perder contenido? | error recovery preserve input | Error Recovery | Pertinente; Input Types descartado | Errores duplicados / vacío → mensaje dueño de tarea, retry carga explícito | Un siguiente paso claro | Ocultar error de transporte distinto |
| Streaming/queue ¿cómo mostrar trabajo? | chat streaming progress feedback | Progress Indicators; AI Interaction Streaming | Aplicable a feedback real | SSE actual + Stop queue → conservar, sin % inventado | Menor incertidumbre | Decoración typewriter o progreso falso |
| R06/R10 ¿qué duplicación se justifica? | navigation hierarchy redundant actions → navigation consistency | Sticky Navigation; Keyboard Navigation | Parcial; sin match exacto sobre duplicados | CTA según visibilidad; Pending siempre disponible en rail/móvil | Menor repetición con acceso estable | Quitar acceso de historia larga |
| R02/targets ¿cómo tocar controles pequeños? | responsive touch targets web | Touch Friendly Web; Touch Spacing | Web pertinente; 8 px es heurística | Botones 21 px unidos → variantes y área de target del repo | Decisión fiable | Tratar 44 px como requisito WCAG AA |
| Voz ¿cómo cancelar y pedir permiso? | voice recording cancellation → microphone permission | Ningún resultado verificado en ambas | Sin match | Conservar voz vigente; revisión basada en contrato/source, no dataset | Evitar inventar recomendación | Afirmar permiso/transcripción probados |
| Dark ¿qué contrastes revisar? | dark mode text contrast | Contrast Readability; Color Contrast | Guía general; 4.5:1 para texto normal según condiciones | Tokens vigentes → medir pares y estados reales antes de tocar | Lectura | Recolorear por apariencia sin medir |
| Async React ¿cómo reintentar? | async loading state --stack react | Handle async errors | Descartar React 19 async Actions; aprovechar hooks actuales | useClinicalAssistant.load → botón reintentar estado error | Recuperación localizada | Migración de framework fuera de alcance |

## Contraste y decisiones

- No recomendar un wizard nuevo para Assistant: review ya tiene paciente, texto final y confirmación. El wizard manual Capturar/Revisar/Confirmar sigue siendo una vía activa.
- La búsqueda clínica produce pautas de confirmación genéricas. PRODUCT, surface brief y fronteras del backend determinan aprobación humana, no este dataset.
- No hay resultado exacto para colas clínicas ni para un workspace documental completo. La consulta de streaming orienta feedback; Drive actual, su Sheet y sus chips son las referencias locales. No fabricar una recomendación del dataset para reemplazarlos.
- Las consultas de navegación no demuestran que dos accesos sean malos. R06/R10 son observaciones del producto y requieren condiciones de visibilidad.
- El candidato de responsive surge de medición de 24.85 px y fuente grid/nowrap. La biblioteca respalda reflow, no prescribe una implementación exacta.
- Zero-match de voz queda registrado. El permiso y el proveedor no se ejercitaron; revisar Escape/cancelación en código no equivale a una sesión real.
- No generar números de progreso para exportación ni streaming; usar estados reportados por backend. No aumentar persistencia del draft para mejorar recovery sin decisión de privacidad.

La guía local puede contener versiones más nuevas del stack. Se usaron principios compatibles, no snippets que introduzcan React 19 o Tailwind 4. No hay nuevas dependencias propuestas.

