# Hallazgos y trazabilidad

IDs R01–R11 pertenecen a esta auditoría. Los F01–F10 de la auditoría anterior son históricos y no se renumeran como bugs actuales. Evidencia .jpg de esta corrida, con snapshot .txt asociado cuando existe. C = confirmado por render/fuente; O = observación de diseño; G = gate; H = hipótesis de impacto.

| ID / estado | Síntoma y evidencia | Fuente responsable | Causa e impacto | Riesgo de cambio |
|---|---|---|---|---|
| R01 P1 G/C | Bundles live/local distintos, 01–03 y provenance.json | Servidor local/build, no componente | Diferencia C; cache/deploy causa no probada. Impide atribuir fixes a runtime | Rebuild/restart sin preservar estado; plan separado |
| R02 P1 C | Tres botones unidos 21px, foco fuera; 05/35 | ClinicalAssistantArea.tsx:788–824 | Div alertdialog, botones sin variantes; clases sin reglas CSS. Tab va a Pending. H: decisión equivocada | Cambio inadvertido de semántica mantener/conservar/descartar |
| R03 P1 C | Textarea 24.85px a 1024; 29/30/32 y measurement JSON | ClinicalComposer.tsx:106–124; globals.css:3227–3279; ContextualAssistant.tsx:41–85 | grid minmax(0,1fr) auto; toolbar nowrap; helper sólo desaparece bajo 768 global | Voz, Stop o adjuntos ocultos si se compacta mal |
| R04 P2 C | Retenido Ana, compositor Consulta al asistente; 06 | ClinicalAssistantArea.tsx:789–828; ClinicalComposer.tsx label/placeholder | patient del hilo null en lugar de presentación del draft origin | Hacer enviable el borrador en contexto equivocado |
| R05 P2 C | Error 502 en artefacto y arriba del composer; 12 | ClinicalAssistantArea.tsx:688–691 + estado de artefacto; useClinicalAssistant.ts resolve/reconcile | Una operación se representa por dos propietarios de error | Dedupe por string elimina fallos diferentes |
| R06 P2 O | Evolución pendiente + Ver borrador repite artefacto; 10/11 | ClinicalAssistantArea.tsx dock de pending/review | Acceso continuo útil fuera de vista; condición de visibilidad pendiente | Perder recuperación tras cerrar review o en transcript largo |
| R07 P2 C/H | Después de retry faltan Bruno/copia hasta cargar más; 19→20 | ClinicalPendingWork.tsx:13–17; useClinicalPendingWork.ts:15–35 y refresh | refresh sin cursor reemplaza page. Impacto operacional inferido; no provider real | Duplicados, cursor obsoleto, foco perdido al resolver ítem |
| R08 P2 C | Árbol h1→h3→h4; 07.txt/17.txt | clinical/EvolutionReviewArtifact.tsx:289/484 | h3 fijo; contextual ya tiene h2 padre | Doble heading o nivel incorrecto en otra composición |
| R09 P3 C/H | Artifact 09 oct sin hora; manual/review con hora; 07/17/33 | EvolutionReviewArtifact.tsx:304–305; clinicalDate.ts | Format short en Assistant. H: distinguir evoluciones del mismo día | Cambiar timezone/valor temporal por “normalizar” formato |
| R10 P3 O | Pending en sidebar y header; 07 | Sidebar/view + header ClinicalAssistantArea | Mismo destino con dos entradas; no siempre redundante | Quitar navegación cuando sidebar está cerrada |
| R11 P2 C | Error de carga + ¿Qué necesitas hacer?; ningún retry visible; 36 | useClinicalAssistant.ts load; ClinicalAssistantArea vacío/error | Estados vacíos y fallidos no mutuamente excluyentes | Adquirir hilo nuevo o borrar draft al intentar reload |

Los números de línea identifican HEAD inspeccionado; pueden cambiar en futuros parches. R02 carece de estilo local: búsqueda por clinical-context-boundary/retained sólo encontró JSX. R03 fuente y geometría se corroboran; no es una falsa alarma basada en overflow.

## Contraste con auditoría y spec activas

| Histórico / contrato | Estado observado ahora | Consecuencia |
|---|---|---|
| F01 Stop ambiguo / F07 cola | Stop actual, copy de cola y cuarto draft conservado, 21/23 | No abrir bug duplicado; preservar |
| F02/F08 cambio paciente/null | Guard existe y bloqueo protege draft, 05/06 | R02/R04 son ejecución/copy de esa protección, no ausencia de continuidad |
| F03 identidad | Nombre y RUT masked en contexto/artefacto, 04/07 | No volver a pedir identidad ya implementada |
| F04 buffer editor | A→B→A conserva edición, 09 | Mantener y cubrir regresión |
| F05 Escape aprobación | Escape devuelve foco al trigger y no resuelve, 10/11 | No abrir fix duplicado |
| F06 save-failure | Recuperar devuelve draft, 12/13; confirmar fixture consistente 41 | Recovery UI probado; DB gate sigue abierto |
| F09 densidad / F10 coarse | Scope actual ya incluye trabajo de compactación/44px | No afirmar coarse verificado; R03 es ancho de contenedor nuevo |
| Tasks 14.1 | Evidencia integrada histórica marcada | No reclamar su corrida como nueva |
| Tasks 14.2 y 14.3 | Abiertas en fuente | No cerrarlas con screenshots o fixtures |

## Registro de confianza

- Observación live real: 01–03; no notas clínicas ni writes. La sesión estaba autenticada.
- Observación build local con API fixture: 04–42. Sintético, no DB/provider. Aplicar en 40 y confirmación consistente en 41 son transiciones reales de UI contra respuestas simuladas.
- Lectura estática: runtime, voice, reduced-motion, safety, export transaction; no ejecución de esas garantías.
- Inconcluso: 16, prepare ACTION_B resuelto como ACTION_A en adaptador. 17 sólo estado inyectado. No asignar fallo del adaptador al producto.
- Transitorio: 22/27/28 durante resize. No diagnosticar clipping persistente; usar 23/37/38.
- Hipótesis: R09 confusión entre atenciones mismo día; R07 carga cognitiva en uso real. Requieren usuarios o prueba operacional.
- No cuantificado: contraste, rendimiento, lector de pantalla, coarse, zoom. No WCAG compliance.

No se hicieron entrevistas con profesionales; el modelo de tareas proviene de PRODUCT/surface briefs y revisión experta. No fabricar citas de usuarios ni resultados de usabilidad.

