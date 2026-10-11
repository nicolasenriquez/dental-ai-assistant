# Prime y journey AS-IS

Auditoría documental y visual del 10/10/2026, HEAD 4957faf, rama feat/ai-assisted-evolutions. Revisión en un solo contexto por decisión humana. Las mutaciones clínicas se simularon exclusivamente en un servidor de fixtures aislado; no hubo implementación.

## Autoridad y arquitectura

Se revisaron AGENTS.md, PRODUCT.md, DESIGN.md, UX_PRINCIPLES.md, frontend-architecture.md, las superficies clinical-assistant y patient-workspace, la auditoría anterior del Assistant y proposal/tasks del cambio activo harden-clinical-workspace-continuity. La auditoría anterior informa el contraste; sus capturas y resultados no se presentan como evidencia nueva.

PRODUCT fija el modelo: el profesional escribe o dicta, la IA propone, el profesional revisa y confirma. Dictado no envía. Guardado en ficha y copia en Drive son estados distintos. El paciente y su identidad enmascarada deben acompañar la tarea. El contexto no enviado vive en memoria por privacidad; no proponer localStorage, persistencia silenciosa o exportación automática.

DESIGN conserva Inter, tinta/slate oscuro, azul para la acción principal y tokens semánticos. La densidad compacta de escritorio y los controles coarse de 44 px son decisiones vigentes. No sustituir el sistema por otro sugerido por una biblioteca. La dirección de componentes es page → domain → pattern → primitive → token.

| Responsabilidad | Propietario actual | Límite |
|---|---|---|
| Rutas y proveedores autenticados | App.tsx | /patients, /assistant, /a/:threadId, /chat y /c/:id |
| Composición Assistant/Drive | pages/ClinicalAssistant.tsx | Adquisición de hilo, pending sin adquirir, retorno y panel Drive |
| Runtime compartido | ClinicalRuntimeProvider.tsx; useClinicalAssistant.ts; clinicalRuntime.ts | Hilos, estados SSE, reconciliación, buffers de campos |
| Contexto, cola y contenido | clinical-assistant/ClinicalAssistantArea.tsx | Origen paciente, protección al cambiar, queue 3, dock |
| Captura | ClinicalComposer.tsx; ComposerShell; VoiceComposerControl | Enter/Shift+Enter/IME; voz separada de envío |
| Asistente desde ficha | ContextualAssistant.tsx; useContextualAssistant.ts | Panel >=1024; Sheet 768–1023; ruta completa móvil |
| Artefacto y revisión | clinical/EvolutionReviewArtifact.tsx; aprobación desde ClinicalAssistantArea | Evidencia, aplicar/cancelar, preparar intención y confirmar |
| Drive | DriveWorkspace.tsx y componentes de sección; clientes api.ts | Notas, documentos, diarios, preview, contexto siguiente mensaje |
| Trabajo pendiente | ClinicalPendingWork.tsx; useClinicalPendingWork.ts | GET paginado, destinos precisos, retry de copia |
| Transporte | lib/api.ts; lib/sse.ts; hook de streaming | Fetch tipado; framing compartido; no fetch en componentes |
| Backend clínico | routes/clinical_assistant.py; clinical_artifacts.py; clinical_assistant/; db/ | Autorización, turnos, seguridad, artefactos y acciones |
| Guardado/exportación | evolution_exports/service.py y repositorios db/ | Transacción canónica y exportación separada |
| Identidad | patients/; sensitive_input.py | RUT enmascarado/sanitizado; no enviar identificadores crudos al modelo |

El código de persist_approved_evolution abre conn.transaction y delega la evolución y la intención opcional de exportación en la misma conexión. Eso describe implementación; no prueba atomicidad bajo concurrencia. Ownership, idempotencia, respuesta perdida y locks requieren el gate 14.2 del cambio activo.

## Activo, histórico y duplicado

- Assistant clínico y asistente contextual comparten runtime. No recomendar un segundo runtime o un nuevo estado global.
- Nueva evolución dental sigue siendo una ruta activa: tiene Capturar → Revisar → Confirmar. No es automáticamente legacy por diferir del chat. En esta ejecución sólo se abrió su captura.
- /chat y /c siguen soportados; el RAG de vídeos es secundario respecto al workspace clínico. No eliminarlo por preferencia estética.
- Autoría de planes fue retirada; planes históricos siguen de sólo lectura. No revivir mutaciones 410.
- Button conserva variantes CSS existentes y la migración a tokens/primitivas no está completa. No justificar un refactor de globals.css a partir de este audit.
- Pendientes en sidebar y header, dock de revisión más artefacto, y error en dos regiones son duplicaciones de intención actuales; deben evaluarse por visibilidad y seguridad.
- El cambio activo ya implementó buffers, continuidad, Stop/cola e identidad. 14.1 está marcado realizado en sus tareas; 14.2 y 14.3 siguen abiertos. No atribuir sus validaciones históricas a esta corrida.

## Proveniencia de runtime

Servidor autenticado localhost:8000: assets observados index-hMjYLKeb.js e index-BzakEpcP.css. Build local existente: index-DRDYVL-j.js e index-Cxj8-c6C.css; hashes completos en [provenance.json](evidence/provenance.json). No se reconstruyó dist. Sus hashes coinciden con los registrados en el material integrado del cambio activo, pero eso no demuestra que el servidor abierto sirva HEAD. R01 es una brecha de paridad, no una regresión clínica.

La pestaña sintética del mismo navegador nativo sirvió ese dist en 127.0.0.1:5311. El adaptador bajo evidence reutiliza builders del harness existente, responde a /api localmente, bloquea rutas desconocidas con 501 y elimina scripts/font links externos del HTML fixture. CSP impide conexiones a proveedores. No accede a Postgres ni hace proxy. El HTML fixture puede usar fallback de fuente; no usarlo para medir carga real de Inter. Se cerró la pestaña y se detuvo el servidor al terminar.

## Journey observado

```text
Entrada Assistant / a/:id
  ├─ sin paciente → consulta general / seleccionar paciente
  └─ paciente activo + identidad enmascarada
       → escribir (Shift+Enter conserva salto; Enter envía)
       → SSE sintético → respuesta en progreso
           ├─ Stop: sólo turno actual → siguiente de cola puede iniciar
           └─ Encolar hasta 3 → cuarto texto permanece en compositor
       → artefacto
           → evidencia → editar campo → aplicar/cancelar
           → revisar/preparar → confirmación de paciente y texto
               ├─ Escape → vuelve al CTA, sin resolver
               ├─ fallo simulado → draft conservado → recuperar
               └─ guardada [confirmación fixture 41; DB no probado]
                    → Drive copia pendiente [estado independiente]
  Cambio paciente con texto
       → Mantener / Conservar y cambiar / Descartar y cambiar
       → conservar origen bloquea envío + retorno al paciente original
  Cambio hilo → edición de campo reaparece al volver
  Ficha → contextual panel/Sheet → Assistant completo conserva texto
       → nueva evolución captura → ficha [sin generar ni guardar]
  Drive → Notas → preview → incorporar al próximo mensaje
       → chip removible → cerrar → hilo conservado
       → Documentos sin paciente pide selección
       → Diarios vacíos y preferencia semanal [sin modificar]
  Pendientes → revisión / continuar / copia fallida
       → página siguiente → retry sintético → lista vuelve a primera página
```

## Evidencia y límites por tramo

| Tramo | Evidencia de esta corrida | Alcance probado |
|---|---|---|
| Entrada real / escritorio / Drive sin paciente | 01–03 .jpg | Sólo navegación y lectura; sin nota ni exportación |
| Selección, guard y origen retenido | 04–06, 35 | UI sintética; foco fuera del guard; envío bloqueado tras conservar |
| Artefacto, evidencia, editor y buffer | 07–09 | Edición local conservada A→B→A; cancelar |
| Review y Escape | 10–11 | Foco retorna a Confirmar guardado; no resolver con Escape |
| Fallo y recuperar | 12–13 | Respuesta sintética de fallo; borrador vuelve editable |
| Documento y adjunto | 14–15 | Preview sintético y chip; no enviar archivo real |
| Guardada / Drive pendiente | 17 | Sólo render de estado inyectado |
| Aplicar y confirmar intención preparada | 40–42 | PATCH fixture aplicado; confirmación ACTION_A → guardada; retry cambia sólo copia |
| Pendientes vacío/paginado/retry | 18–20 | Tres categorías; destinos con IDs; refresco resetea paginación |
| Stream y cola | 21, 23 | Framing válido fixture; límite 3; Stop inicia siguiente; nota cuarta retenida |
| Drive móvil, diarios | 24–25, 39 | Overlay, secciones, Escape devuelve foco; sin exportar |
| Responsive y ficha | 26, 29–34, 37–38 | CSS 360×800, 390×844, 768×1024, 1024×768; desktop 1440×900 en 05–21 |
| Error de carga | 36 | Mensaje de fallo convive con bienvenida de vacío; sin retry local visible |

Snapshots .txt acompañan capturas 05 en adelante; mediciones en native-browser-checks.json. Ningún viewport medido presenta scrollWidth mayor que innerWidth; eso NO demuestra una composición usable: el textarea contextual mide 24.85 px a 1024×768 (30), y también es estrecho en Sheet (32). Las capturas 22/27/28 incluyen transiciones de resize y no son la referencia estable; usar 23/37/38.

La primera simulación SSE estaba incompleta (faltaba item_id); se corrigió sólo el adaptador y se repitió. No clasificar su error como defecto de producto. La primera confirmación tuvo IDs inconsistentes ACTION_B/A y una reconciliación inconclusa del fixture (16). 17 inyecta el estado guardado para evaluar copy y acciones. En la repetición 41 una intención preparada ACTION_A consistente sí terminó en Guardada en ficha con fallo Drive separado; 42 reintentó sólo la copia. Esto prueba la transición UI con API sintética, nunca persistencia real. 40 prueba Aplicar un campo con PATCH fixture y feedback Cambios guardados.

No se probó: micrófono/permisos/transcripción real, dispositivos físicos, coarse pointer, lector de pantalla, 200% zoom, latencia de proveedores, atomicidad de DB, contenido real exportado ni idempotencia. El control de dictado y sus rutas de cancelación se inspeccionaron en fuente. No se concedieron permisos. Loading quedó observado en el listado de pacientes y en “Preparando respuesta clínica”; no se midió tiempo real ni se forzó duración de carga como rendimiento.

