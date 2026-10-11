⚠️ DEGRADED: single-context (sub-agents declined by user)

# Impeccable Critique + Audit

El usuario rechazó explícitamente la evaluación con dos subagentes. Se aplicó la crítica en un solo contexto: Assessment A quedó escrito en [assessment-A.md](evidence/assessment-A.md) antes de ejecutar el detector estático. No presentar A y B como juicios independientes.

## Juicio de producto

El profesional puede conservar el contexto en cambios de hilo y en revisión, pero escribir desde el panel contextual puede volverse impracticable. La protección al cambiar de paciente es funcionalmente prudente y visualmente incompleta. La pregunta “¿para quién estoy escribiendo?” necesita una respuesta consistente entre header, borrador retenido y etiqueta del compositor.

Cinco fortalezas: identidad clínica enmascarada; edición recuperable entre hilos; revisión humana explícita con retorno de foco; Stop/cola con alcance aclarado y capacidad limitada; estados de ficha y copia Drive separados. Las dos últimas fortalezas se observaron con fixtures, sin confirmar comportamiento de proveedores o transacciones reales. La repetición 40–42 verificó Aplicar un campo, confirmar una intención preparada y reintentar sólo la copia Drive con respuestas sintéticas.

El centro del producto tiene sentido. Un redesign, otra paleta o más animación no resolverían el cuello de botella. Hay que arreglar composición y decisiones, y consolidar mensajes según su propietario.

## Priorización

No se encontró P0 dentro del alcance probado. Eso no cierra gates de seguridad ni excluye fallos no explorados. R01 es una brecha de verificación; los demás son defectos/observaciones de UX del dist existente, con fuente corroborante.

| Orden | ID | Prioridad | Hallazgo | Evidencia | Causa / confianza |
|---|---|---|---|---|---|
| 1 | R03 | P1 | Campo contextual de unos 25 px; texto casi vertical | 29–32; contextual-input-measurement.json | Grid con columna de toolbar auto y ayuda nowrap; confirmado |
| 2 | R02 | P1 | Trabajo sin enviar: botones unidos, foco externo, semántica alertdialog incompleta | 05, 35; context-decision-measurement.json | Botones nativos sin variante; sin gestión modal/foco; confirmado |
| 3 | R01 | P1 gate | Servidor abierto y dist tienen bundles diferentes | 01–03; provenance.json | Diferencia confirmada; causa de despliegue/cache no determinada |
| 4 | R11 | P2 | Error al cargar hilo presentado junto a bienvenida de vacío; sin retry visible | 36 | Render de vacío y error independientes; confirmado |
| 5 | R04 | P2 | Borrador retenido para Ana anunciado como Consulta al asistente tras quitar paciente | 06 | Composer toma paciente del hilo y no del draft retenido; confirmado |
| 6 | R07 | P2 | Retry Drive vuelve a primera página de Pendientes | 19→20; hook líneas 15–35 | refresh() sin cursor reemplaza page; confirmado, impacto real por validar |
| 7 | R05 | P2 | Un fallo de guardado ocupa dos regiones rojas | 12 | Error del artefacto más assistant.error del dock; confirmado |
| 8 | R06 | P2 | Dock de revisión duplica el artefacto de aprobación visible | 10–11 | CTA persistente sin condición de visibilidad; observación, utilidad en historia larga |
| 9 | R08 | P2 | Jerarquía h1→h3→h4 en artefacto de Assistant completo | 07.txt y 17.txt | h3 fijo en componente compartido; confirmado, contextual sí tiene h2 |
| 10 | R09 | P3 | Fecha de artefacto omite hora y difiere del formato declarado | 07, 17 versus 33 | formato corto en modo Assistant; confirmado; ambigüedad mismo día hipotética |
| 11 | R10 | P3 | Pendientes aparece en sidebar y header expandidos | 07, 19 | Entradas de igual destino; observación contextual, conservar acceso en rail/móvil |

Componentes, riesgo y aceptación por ID en [traceabilidad](07_FINDINGS_TRACEABILITY.md). R02/R03 son causas de ejecución; R05/R06/R09/R10 requieren criterio de producto, no aplicación automática.

## Audit técnico y visual

| Dimensión | Evaluación |
|---|---|
| Layout/densidad/scroll | Columna de lectura bounded y scroll de transcript; composer queda disponible en móvil. Panel estrecho rompe el espacio de escritura sin overflow horizontal. Cola añade altura; no borrar mensajes para ahorrar espacio. |
| Tipografía/alineación | Identidad y campos legibles en ancho completo; guard carece de agrupación. Fecha y headings divergen de superficies vecinas. Fuente fallback posible en fixture. |
| Tema oscuro | Jerarquía azul/ink consistente; muted requiere medición de contraste en estados finales. No hay contraste cuantificado ni prueba de modo claro. |
| Foco/teclado | Approval Escape y Drive móvil retornan foco. El guard no recibe foco; Tab sale de la decisión. Shift+Enter introduce newline sin enviar. |
| Targets | Guard móvil: 21 px de alto, primeros botones sin separación; incumple intención de targets del repo. No afirmar coarse 44 px medidos aquí. |
| Loading/error/empty | Preparando respuesta y vacío Pendientes son explícitos. Error de hilo compite con un estado vacío (R11); fallo de guardado redundante (R05). |
| Modals/drawers | Modal de review conserva aprobación; contextual desktop no modal y tablet Sheet responden al contrato. Drive móvil oculta workspace y retorna. No certificar lector de pantalla. |
| Performance | Sin perfil de frames, INP/LCP o proveedor. Detector de width no equivale a jank demostrado. |
| Theming/motion | Tokens y reduced-motion existentes leídos; emulación reduced-motion no realizada en esta corrida. |

[WAI APG alertdialog](https://www.w3.org/WAI/ARIA/apg/patterns/alertdialog/) describe una decisión modal con descripción y gestión del foco. No añadir aria-modal=true a un div que continúa permitiendo interacción exterior. Reutilizar un AlertDialog existente o elegir explícitamente una región inline sin semántica modal.

[WCAG 2.2 Target Size Minimum](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) usa 24 px y excepciones; 44 px es la meta más exigente del repo para coarse. Los botones contiguos de 21 px justifican un finding y prueba específica de 2.5.8; no una afirmación global de incumplimiento/compliance. [Focus Not Obscured Minimum](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) exige foco no totalmente oculto; la recomendación AAA de foco totalmente visible no debe confundirse con AA.

## Detector B, estático y filtrado

Comando real: node .agents/skills/impeccable/scripts/detect.mjs --json app/frontend/src/components/clinical-assistant app/frontend/src/pages/ClinicalAssistant.tsx app/frontend/src/styles/globals.css. Resultado: seis advertencias en [impeccable-detector.json](evidence/impeccable-detector.json), sin navegador alternativo.

- Dos side-tab: no remover automáticamente; son acentos de estado/dominio y requieren revisión en su contexto.
- Dos overused-font: descartadas como defectos; Inter es autoridad explícita de DESIGN.
- clinical-dot-bounce: indicador de trabajo en curso, no evidencia de estética defectuosa por su nombre. Revisar repetición y reduced-motion, conservar feedback.
- transition width en barra de cuota: fuera del cuello de botella clínico, sin jank medido. No recomendar refactor ahora.

El detector no encontró por sí solo R02/R03. Seis warnings no son seis nuevos bugs ni un score.

## Score heurístico reproducible

Score UX/UI: **76/100** (media ponderada 75.9, redondeada). Valor experto del build local observado, no métrica de usuarios, benchmark, WCAG o calidad clínica. No mezcla UI real antigua con fixture local y no cubre gates backend.

| Criterio | Peso | /100 | Explicación |
|---|---:|---:|---|
| Claridad | 12 | 82 | Paciente y revisión claros; origen retenido y error-vacío confunden |
| Calidad de interacción | 12 | 70 | Buen retorno de foco; guard y textarea estrecho fallan |
| Continuidad | 18 | 86 | Buffers y paso contextual/completo preservan texto; reload de memoria excluido |
| Arquitectura de información | 10 | 80 | Pacientes/Assistant/Pending definidos; rutas manual/chat distintas requieren claridad |
| Responsive | 12 | 62 | Sin overflow medido; composición contextual inutilizable a anchos probados |
| Accesibilidad | 12 | 65 | Labels/skip/foco positivos; guard y heading requieren corrección, AT sin validar |
| Consistencia visual | 8 | 80 | Sistema coherente, excepción guard evidente |
| Recuperación | 10 | 75 | Failed save recuperable; carga sin retry y paginación reset |
| Carga cognitiva | 6 | 84 | Desglose clínico simple; duplicaciones evitables |

No prometer un score TO-BE. Se recalculará sólo después de implementar y repetir la matriz.

## Escalas propias de la skill

Nielsen (0–4, todos aplican en este workspace): status 3; match real-world 3; control/freedom 3; consistency 3; error prevention 3; recognition 3; efficiency 2; minimalist design 3; recovery 2; help 3. Total **28/40**, operable con debilidades en escritura y recuperación. Cada descuento se vincula a R02/R03/R04/R05/R07/R11; no se puntúa documentación de ayuda externa no recorrida. Esta escala complementa el score ponderado, no lo sustituye.

Audit técnico (0–4): accesibilidad 2, responsive 2, theming 3, integrity 3. Performance n/a por falta de medición. Total acotado **10/16**; no se imprime /20 ni se afirma AA por puntuar. Theming 3 es inspección de tokens/incumbent dark, no certificación de contrastes o theme switching. Reduced-motion requiere prueba de preferencia real; la regla global no se condena automáticamente sin probar pérdida de feedback.

Carga cognitiva: tareas clínicas intrínsecas (evidencia, edición, decisión humana) se preservan. Carga extrínseca: R03 fuerza salida de panel; R04 exige recordar origen; R05/R06 duplican estado; R07 obliga volver a buscar; R11 exige interpretar vacío/error. Los tres botones del guard no exceden cuatro opciones, pero carecen de jerarquía. La review tiene dos decisiones, un patrón razonable; no eliminar confirmación para ahorrar un click.

Journey emocional inferido, sin entrevistas: selección ofrece orientación; draft y evidencia dan control; cambio de paciente y fallo de carga son valles de incertidumbre; confirmación humana y guardada/fallo Drive separado son momentos de confianza. Persona profesional frecuente: R03 perjudica escritura en consulta. Persona con teclado: R02 no conduce foco a la decisión. Persona nueva: R11 puede interpretarse como hilo vacío. Son hipótesis expertas, no declaraciones de pacientes/profesionales entrevistados.

