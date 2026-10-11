# Shape: propuesta TO-BE pendiente de aprobación

Se aplica el procedimiento de Shape como planificación. El brief humano ya define audiencia, objetivo, sistema visual y límites. No se abre otra entrevista ni se impone una dirección visual nueva. Este documento es una propuesta, no una funcionalidad implementada ni un contrato confirmado.

## Brief

Profesional dental durante una consulta, con interrupciones y trabajo clínico sensible. Debe capturar, revisar y guardar una evolución del paciente correcto sin perder texto. Éxito observable: escritura usable en cualquier contenedor; origen inequívoco; confirmación humana explícita; recuperación que conserva el draft; estado ficha independiente de Drive.

Dirección: conservar ink/slate, Inter, azul, tokens, shell, runtime compartido y rutas. Priorizar espacio de escritura y decisión clínica. Ningún nuevo wizard, provider, persistencia local, sistema de componentes, arquitectura de estado o exportación automática.

Rangos de prueba futura: sin paciente/paciente A/B/null; nota vacía, multilinea y larga; nombres extensos; artifact draft/pending/failed/approved; queue 0/1/3 y cuarto texto; adjuntos 0/1/varios; múltiples páginas de pendientes; toolbar voz en cada estado. No inventar límites de nota o máximos de documentos diferentes a los contratos.

## Diagramas completos

AS-IS:

```text
Paciente en ficha ──→ Asistente contextual
                      ├─ >=1024 panel estrecho: textarea compite con toolbar
                      ├─ 768–1023 Sheet: misma competencia
                      └─ móvil → /a/:id
                                    ↑ borrador compartido ↓
                       Asistente completo
                           ├─ nota → stream → queue / Stop
                           ├─ paciente cambia
                           │    → guard inline mal presentado
                           │    → origen retenido pero label general
                           └─ artefacto → evidencia/editar/aplicar
                                → review + dock repetido
                                → confirmar humano
                                     ├─ guardada ficha → Drive separado
                                     └─ fallo → draft conservado + error repetido
Pendientes → página 1 → más → retry → página 1
Carga falla → error + bienvenida de vacío
```

TO-BE (propuesto):

```text
Entrada desde ficha o Assistant
  → paciente actual identificable; draft origin independiente explícito
  → captura con fila de texto prioritaria en contenedor estrecho
       ├─ escribir / dictar [no auto enviar]
       └─ documento Drive nombrado/removible para siguiente mensaje
  → enviar → trabajo real reportado
       ├─ encolar <=3, texto cuarto conservado
       └─ detener sólo turno actual, cola sigue su contrato vigente
  → artefacto con evidencia y headings según contexto
       → editar [buffer] → aplicar/cancelar
       → preparar revisión → confirmar paciente + texto final
            ├─ cerrar/Escape → no resolver, foco retorna
            ├─ fallo → un aviso dueño de la acción + recuperar
            └─ guardada en ficha → ver ficha
                 └─ Drive pendiente/fallido → retry sólo copia
  Cambio paciente con trabajo
       → decisión de mantener / conservar origen / descartar explícito
       → conservar: nombre de origen y retorno; envío bloqueado
  Pendientes
       → revisión/continuar en destino exacto
       → retry de copia manteniendo páginas, foco y contexto
  Carga falla
       → estado error dedicado + reintentar [sin simular workspace vacío]
  Navegación/Drive
       → acceso siempre disponible; duplicado sólo si sirve fuera de vista
       → close/Escape retorna al origen apropiado
```

## AS-IS → fricción → cambio mínimo → aceptación

| ID | AS-IS / fricción | TO-BE y por qué | Cambio mínimo propuesto | Criterio de aceptación |
|---|---|---|---|---|
| R01 | Bundles distintos; comparación no fiable | Paridad documentada antes de validar fix | Manifest/hash de build y servidor; ningún CSS | Capturas reportan URL, HEAD y assets; no mezclar versiones |
| R02 | Guard sin foco ni jerarquía | Decisión clínica coherente y operable | Reuse AlertDialog + Button; safe default Mantener | Foco dentro si modal, Tab/ShiftTab/Escape/retorno; ninguna acción cambia/destruye sin elegir |
| R03 | Toolbar desplaza escritura | Escritura primero según ancho disponible | Adaptar ClinicalComposer/ComposerShell, no runtime | Texto multilinea legible en panel/Sheet/full; targets y Stop visibles a 360/390/768/1024/1440 |
| R04 | Origen retenido Ana; label general | Copia asociada al draft, separado del header actual | Prop de presentación/origen en Composer, con mismo bloqueo | A→B/null no relabela como general; retorno conserva texto; no envío a destino nuevo |
| R05 | Error duplicado | Un aviso por operación fallida | Dedupe por artefacto/operación, no por string global | Recuperar visible; fallos distintos no se ocultan; contenido intacto |
| R06 | Dock repite artifact visible | Acceso sólo si aporta recuperación | Condición de visibilidad/destino en dock existente | Sigue disponible en historia larga y tras dismiss; confirmar nunca se autoejecuta |
| R07 | Refresh sin cursor pierde páginas | Reintento conserva lugar y resultados cargados | Refrescar ítem/páginas en hook actual | Página 2 sigue visible tras retry/focus ventana; ítem resuelto se retira sin perder foco |
| R08 | h3 fijo ignora página padre | Estructura de headings según composición | Nivel configurado/heading semántico existente | Ruta completa h1→h2→h3; contextual h2→h3→h4 sin doble heading |
| R09 | Hora escondida en artifact | Atención temporal comparable | Reuse formatClinicalDateTime según contrato aprobado | Misma fecha/hora y timezone en review/ficha/artifact; sin cambiar dato |
| R10 | Doble acceso Pending expandido | Acceso único cuando la navegación ya lo muestra | Condición dependiente de sidebar, no quitar ruta | Rail, móvil y contextual mantienen acceso; teclado no pierde destino |
| R11 | Error presentado como vacío | Error dedicado con retry seguro | State rendering + load() vigente | 503→retry→hilo correcto; no adquirir otro hilo ni borrar buffers |

## Composición, copy y accesibilidad

Reutilizar Button, AlertDialog/Sheet existentes, ComposerShell, ClinicalAssistantArea, EvolutionReviewArtifact, typed api.ts y hooks. No crear una familia paralela de confirmaciones.

Simplificar el auto-width de toolbar cuando el panel es estrecho, la selección de errores visibles y la condición del dock. Eliminar sólo la duplicación de mensajes o CTA cuyo destino ya está disponible. Conservar el enlace de recuperación fuera de vista y acciones de evidencia/cancelación.

Copy propuesta: “Hay trabajo sin enviar para Ana”; “Mantener a Ana”; “Conservar para Ana y cambiar”; “Descartar este trabajo y cambiar”. El último necesita especificar qué se descarta: draft, cola y/o adjuntos conforme al dominio vigente. No prometer guardado durable si sólo se conserva en memoria. Para carga: “No pudimos cargar esta conversación. Reintentar”. Para origen retenido: “Nota conservada para Ana; vuelve a ese paciente para enviarla”.

Targets del guard usan primitivas y meta del repo; la decisión modal exige foco real, descripción y retorno. No usar aria-modal para decorar. Headings se determinan por composición. Errores tienen estado anunciado sin repetir texto. La fecha conserva timezone y no se modifica por formato.

## Riesgos y decisiones humanas

1. Aprobar la modalidad del guard: recomendación AlertDialog real por decisión crítica; alternativa inline necesita otro rol y recorrido de foco deliberado.
2. Aprobar texto exacto y alcance de descarte conforme a memoria por hilo/contexto. No cambiar clearing ni persistencia.
3. Aprobar criterio del dock fuera de vista; comprobar historia larga y recuperación antes de retirar algo.
4. Aprobar fecha/hora visible y formato coherente con DESIGN; es una decisión visual durable que sólo se documentará en autoridad cuando se autorice implementar.
5. Pendientes: decidir refresco de páginas vs ítem; no dejar estado de copia obsoleto ni añadir métricas inventadas.
6. Resolver paridad R01 antes de validar contra servidor real.

No hay contradicción intencional con el cambio activo: buffers, actor identity, Stop scope, queue cap, original-context y approval survive permanecen. R02/R03/R04/R05 comparten archivos de continuidad y no deben implementarse en paralelo con ese cambio. No cerrar sus gates ni crear un segundo OpenSpec ahora. Este Shape requiere aprobación antes de crear specs o aplicar cambios.

