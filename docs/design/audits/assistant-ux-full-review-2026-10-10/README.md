# Dental AI Assistant — UX audit, research, Shape y Polish review

**76/100 UX/UI**, valoración experta del build local existente observado el 10/10/2026. Criterios y cálculo en [02](02_IMPECCABLE_CRITIQUE_AUDIT.md). No es una métrica de usuarios, certificación WCAG ni validación de seguridad clínica.

**Phase 7 concluida. Shape pendiente de aprobación. Sólo documentación y evidencia.** No se crearon OpenSpecs, commits o deployments; no hubo cambios de aplicación, tokens, autoridad de diseño o migraciones. Revisión en un solo contexto por rechazo explícito de subagentes.

## Lectura

1. [Prime, ownership y AS-IS](01_CODEBASE_PRIME_AND_JOURNEY.md)
2. [Impeccable Critique/Audit y score](02_IMPECCABLE_CRITIQUE_AUDIT.md)
3. [UI/UX Pro Max: queries y pertinencia](03_UI_UX_PRO_MAX_RESEARCH.md)
4. [Emil: antes/después conceptual](04_EMIL_DESIGN_ENGINEERING.md)
5. [Shape TO-BE propuesto](05_IMPECCABLE_SHAPE_TO_BE.md)
6. [Polish review: must/should/nice](06_IMPECCABLE_POLISH_REVIEW.md)
7. [Trazabilidad y contraste histórico](07_FINDINGS_TRACEABILITY.md)
8. [Candidatos OpenSpec, sin creación](08_OPENSPEC_CANDIDATES.md)
9. [Índice de evidencia](evidence/README.md)

## Diez prioridades

| Orden | ID | Tipo | Prioridad |
|---|---|---|---|
| 1 | R03 | Corrección de UI | Campo contextual reducido a 24.85 px a 1024; escritura casi vertical |
| 2 | R02 | Corrección de interacción/a11y | Decisión de paciente sin foco, botones de 21 px unidos |
| 3 | R01 | Gate de verificación | Bundles del servidor y build local diferentes; no mezclar versiones |
| 4 | R11 | Recuperación | Carga fallida muestra bienvenida de vacío y no retry local |
| 5 | R04 | Claridad de contexto | Borrador retenido de Ana etiquetado como consulta general |
| 6 | R07 | Continuidad operacional | Retry Drive resetea páginas de Pendientes |
| 7 | R05 | Jerarquía de feedback | Mismo fallo de guardado se repite en dos regiones |
| 8 | R06 | Propuesta contextual | Dock repite artefacto visible; conservarlo fuera de vista |
| 9 | R08 | Semántica | Heading de artefacto salta h1→h3 en ruta completa |
| 10 | R09 | Decisión de presentación | Fecha corta omite hora respecto al contrato y review |

R10 es observación adicional P3: Pending en sidebar/header; no quitar acceso si sidebar no está expandida. No hubo P0 detectado en este alcance. Conteo: 11 IDs, 3 P1 (uno gate), 6 P2, 2 P3.

## Fortalezas que se deben preservar

- Paciente identificable y RUT masked durante el trabajo.
- Buffer de edición recuperado al volver al hilo.
- Confirmación humana, contenido preparado y retorno de foco al cerrar.
- Queue bounded a tres, cuarto borrador intacto y Stop limitado al turno actual.
- Estado Guardada en ficha independiente de copia Drive y reintento.

## Journey y resultado propuesto

AS-IS: ficha/Assistant → paciente → nota/Drive contextual → stream/cola/Stop → evidencia/editar → review → confirmación → guardada y copia separadas; fallo recuperable. Cambios de hilo conservan edición; cambio de paciente muestra una decisión mal presentada. Panel contextual estrecho y refresh de pendientes degradan eficiencia.

TO-BE: misma secuencia y mismo runtime; escritura prioritaria por ancho del contenedor; decisión accesible y origen explícito; un aviso por operación; retry de carga dedicado; lista conserva lugar; headings/timestamps coherentes. Diagramas completos en [Shape](05_IMPECCABLE_SHAPE_TO_BE.md). Nada de esto se implementó.

## Investigación y ejecución

UI/UX Pro Max aportó guías pertinentes de reflow, foco, recovery, targets y estados de trabajo. Las búsquedas de voz no dieron match verificado; la biblioteca no proporciona prueba clínica. Se descartaron APIs React 19/Tailwind 4 y no se generó un design system.

Emil prioriza feedback inmediato y escritura frecuente. Mantener movimiento corto con propósito; no añadir typewriter, % artificiales o animaciones decorativas. Reduced-motion fue leído, no ejercitado aquí.

Polish MUST FIX: composer, guard, carga fallida, origen retenido y headings. SHOULD FIX: recuperación paginada, duplicación de error/dock y fecha según decisión. NICE: reducir acceso duplicado sólo cuando aporta simplicidad sin perder navegación.

Quick wins: layout de toolbar en contenedor estrecho; Button/AlertDialog existentes para guard; retry con load actual; heading level contextual. Dedupe/dock requiere tests de causación y visibilidad, no ocultación global.

## Candidatos y riesgos

C0 paridad de entorno; C1 composer; C2 decisión/origen; C3 recovery/feedback; C4 pendientes; C5 semántica/fecha. [Cada candidato](08_OPENSPEC_CANDIDATES.md) declara scope, ownership, dependencias, riesgos, pruebas, aceptación y rollback. C1/C2/C3 comparten archivos con harden-clinical-workspace-continuity: secuenciar o integrar alcance aprobado; no generar una spec competidora.

Decisiones: modalidad y copy del guard, descarte preciso, dock offscreen, formato fecha/hora, refresco paginado y paridad del servidor. Continuidad 14.2 (DB/AT/dispositivos/provider consent) y 14.3 (suite completa) siguen abiertos.

## Límites y verificación

Navegador nativo Codex, sesión existente; no browser CLI alternativo. Live real sólo lectura y navegación safe. Se usó dist existente en servidor de fixtures loopback aislado, con API/CSP locales. Aplicar campo, confirmar intención preparada y retry Drive se observaron con respuestas sintéticas, sin Postgres ni proveedor.

Una primera confirmación tuvo IDs inconsistentes de fixture (16) y quedó inconclusa; no es bug de producto. La repetición consistente confirmó la transición UI (41–42). Las capturas de resize transitorio están identificadas, sin atribuirles un defecto persistente.

CSS reales: desktop1440×900, 1024×768, 768×1024, 390×844, 360×800; no overflow global medido. Esa condición no garantiza un textarea usable. No se probó micrófono, lector de pantalla, coarse físico, 200% zoom, atomicidad/concurrencia de DB, exportación real ni performance de proveedor. No se ejecutó la suite de aplicación para un cambio sólo documental; no presentar test plan como test ejecutado.

Baseline Git y [verificación final](evidence/final-verification.json) documentan el árbol previamente sucio y la ausencia de diff de código app/staged app/autoridad. Únicos archivos creados por esta ejecución: este directorio. Durante el trabajo aparecieron fuera del audit ocho snapshots Linux y cuatro archivos de release-gates; sus timestamps son posteriores al baseline. No fueron generados por las acciones de esta tarea, no se modificaron y se conservaron. No afirmar igualdad total del árbol de trabajo. Se detuvo el servidor fixture, cerraron pestañas temporales y reseteó viewport. No se tocaron cambios previos ni se ejecutó commit.

Detener aquí. La siguiente acción exige aprobación humana del Shape y scope antes de cualquier OpenSpec o implementación.

