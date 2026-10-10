# Reporte de exploración Playwright headed

2026-10-09 · `http://localhost:8000` · Sesión `assistant-audit`.

## Entorno, autenticación y seguridad

La aplicación abrió inicialmente `/login`. Se solicitó login manual y devolución de control; el usuario respondió `done`. La exploración autenticada comenzó en `/patients`. No se pidió, guardó ni publicó contraseña, cookie, storageState, token OAuth o JWT.

`done` **no confirma** aislamiento de la base ni documentos Drive sintéticos. Por ello se interceptaron APIs con fixtures de paciente, hilos, artefactos, voz y Drive. Los POST clínicos y Drive auditados respondieron desde el harness; los streams se sustituyeron por `ReadableStream` sintéticos. No se ejecutaron saves/exports reales ni se abrió Drive personal. Los resultados validan comportamiento de frontend frente a estos contratos simulados, no una integración clínica completa.

Se usó Chromium headed mediante CLI global (`playwright-cli -s=assistant-audit`). Resize no equivale a dispositivo físico ni teclado móvil. Se añadió una medición con touch CDP y pointer coarse.

## Paridad del código servido

| Objeto | Resultado |
|---|---|
| Rama | `feat/ai-assisted-evolutions` |
| Checkout | `7345f7a2e762220a19c638709e85d1b92ca70fed` |
| Container local | `dynachat-app-blue`, creado `2026-10-08T02:58:18.450054171Z` |
| Main servido | `/assets/index-hMjYLKeb.js` |
| SHA256 main servido | `07c571f3473e4a565b2daf6f0f052dbed3da7cbf02cc0183077b68865b6b06bc` |
| Main checkout compilado | `index-CNNUBSZj.js`; chunk secundario `index-C3Y2UvuD.js` |
| CSS ambos | `index-BzakEpcP.css`, SHA256 `2d880967849d13c1bde4f892892fd503145aab66cb66963e4923c01c3c2a8fb0` |

**El JS servido no coincide por hash con checkout.** CSS idéntico no demuestra comportamiento idéntico. Se compiló checkout dentro de [evidence/build-parity](evidence/build-parity/) y se interceptaron asset requests con [checkout-parity.js](evidence/checkout-parity.js). No se reconstruyó servicio ni se tocó deploy. Al cierre se retiró una clave pública de Picker de la copia generada retenida; [provenance](evidence/build-parity-provenance.json) registra hashes antes/después sin el valor. El JS retenido está sanitizado y no es byte-idéntico al probado; Picker no se ejercitó. F01, F04, F05, transporte/403, teclado y targets se verificaron con ese JS. F02, F03 y F06 quedan browser-confirmed en servido y code-inferred en checkout.

Algunas capturas de edición/revisión se actualizaron durante el rerun checkout. La matriz distingue procedencia por resultados; no se presume que todas las capturas corresponden al mismo bundle.

## Ejecución y evidencias principales

| Escenario | Resultado observable | Evidencia | Bundle |
|---|---|---|---|
| Abrir/cerrar Drive durante stream | Texto, Stop y stream conservados; foco retorna | `browser-matrix-result.txt`, `streaming.png` | Servido |
| Responsive chat y Drive | Sin overflow root a cinco tamaños; compositor visible | `browser-matrix-result.txt`, `chat-*`, `drive-*` | Servido/CSS común |
| Cola | Máximo tres; cuarta entrada editable | `clinical-matrix-result.txt`, `queue-cap.png` | Servido |
| Stop con cola | Solo turno actual; cola continua | `clinical-matrix-result.txt`, `stop-queue.png` | Servido |
| Stop demorado + otro hilo | Stream B abortado, transcript B reseteado | `stop-race-result.txt`, `stop-race-second.png` | Checkout |
| Paciente retirado + nota/adjunto | Se conservan sin confirmación contextual | `edit-context-result.txt`, `attachment-patient-removed.png` | Servido |
| Paciente retirado + artefacto | Identidad visible desaparece | `draft-without-patient.png` | Servido |
| Campo editado sin Aplicar + Pendientes | Buffer perdido al regresar | `checkout-edit-result.txt`, `field-edit-*` | Checkout |
| Escape en aprobación autoabierta | Cero diálogos/cero controles de revisión visibles | `checkout-escape-result.txt`, `checkout-escape.png` | Checkout |
| Save transitorio | «No disponible/expiró»; reload permite retry | `recovery-result.txt`, `save-error.png` | Servido |
| Save éxito + Drive falla | Guardada en ficha + fallo Drive + Reintentar | `saved-drive-failed.png`, `recovery-result.txt` | Servido |
| SSE falla y GET tiene respuesta | Respuesta recuperada, sin Stop ni error restante | `transport-result.txt`, `transport-reconciled.png` | Checkout |
| HTTP 403 sintético | Draft no enviado preservado, mensaje seguro | `transport-result.txt`, `forbidden-recovery.png` | Checkout |
| Voz permiso denegado | Draft preservado | `clinical-matrix-result.txt`, `voice-denied.png` | Servido |
| Voz exitosa sintética | Edición concurrente + transcript insertado; foco; no auto-send | `voice-success-result.txt`, `voice-transcribed-mock.png` | Servido |
| Cambiar paciente durante grabación | Selector protegido | `voice-patient-result.txt`, `voice-recording-mock.png` | Servido |
| Selección Drive con teclado | Inserción explícita con chip | `attachment.png`, `clinical-matrix-result.txt` | Servido |
| Separator/dialog Drive con teclado | Resize; trap; Escape; trigger focus; reduced motion | `keyboard-result.txt` | Checkout |
| Historial largo | 61 grupos, scrollHeight 13774, posición arriba estable | `transport-result.txt`, `long-history.png` | Checkout |
| Contextual ficha | Paciente correcto desde endpoint sintético | `contextual-result.txt`, `contextual-desktop.png` | Servido |
| 401 sintético | Reauth navegación; auth mock termina en `/patients` | `session401-result.txt` | Checkout |
| Targets touch | coarse=true; varios botones 40px; Enviar 44px | `coarse-touch.json` | Checkout |

## Viewports y medidas

| Viewport | Chat | Drive | Artefacto | Alcance |
|---|---|---|---|---|
| 1440×900 | Observado | Pane desktop | Observado | Capturas y métricas geométricas |
| 1024×768 | Observado | Pane/breakpoint observado | Observado | No equivalencia con hardware tablet |
| 768×1024 | Observado | Overlay/sheet | Observado | Teclado virtual no probado |
| 390×844 | Observado | Overlay/sheet | Observado | Resize de Chromium desktop |
| 360×800 | Observado | Overlay/sheet | Observado | Touch coarse medido adicionalmente |

Textarea: límite observado 144px con scrolling interno. Historial: 61 grupos visibles en DOM; scrollHeight 13774. No se tomaron LCP, INP, CLS, tiempos de modelo o latencia Drive. Estos datos no justifican una conclusión de rendimiento global.

## Pruebas automatizadas del checkout

[focused-vitest.txt](evidence/focused-vitest.txt): **70 tests pasaron** en cinco archivos focalizados de hook, área, compositor, voz y runtime provider. Son pruebas existentes, no una suite de regresión creada para esta auditoría. El build de checkout finalizó y dejó artefactos solo en evidence.

No se ejecutó suite completa backend/frontend, lint integral, typecheck integral ni E2E backend real. No se declara PR implementada ni release lista.

## Incidencias del harness, no de la aplicación

Se corrigieron scripts iniciales por ausencia de `URL`/`setTimeout` en VM de routing, variables que no sobreviven entre `run-code`, labels distintos (`Cerrar`, `Detener grabación`) y una referencia inicial a `window` en contexto Node. Un probe de historial inicial no había poblado correctamente la historia; el resultado válido es el rerun de 61 grupos. Los timeouts de estos intentos **no se cuentan como bugs**.

`touch-measurements.json` incluye controles offscreen y pointer fino; no se usa para declarar targets touch. La evidencia válida específica es `coarse-touch.json`, que filtra controles de main dentro del viewport y verifica media query.

## Reproducción segura

1. Abrir sesión headed y autenticar manualmente si hace falta.
2. Instalar interceptaciones de [install-fixtures.js](evidence/install-fixtures.js) en la página controlada. Revisar script antes de usarlo; las fixtures son stateful y no constituyen una suite independiente lista para CI.
3. Para checkout, mantener routing de assets de `checkout-parity.js` y fixtures de API; no sustituir un script sin verificar los handlers previos.
4. Ejecutar cada probe con su estado inicial y registrar resultado y screenshot juntos.
5. Reproducir write escenarios **solo** interceptados o en UAT autorizado con documentos desechables.
6. Cerrar sesión de auditoría al terminar; no reutilizar una página con overrides de fetch para trabajo real.

## Pendiente / bloqueado

Backend real de aprobación/ownership/idempotencia, generación de modelo, OAuth/reconnect real, Drive `unknown`/conflicto/dirty-save, pérdida de proceso servidor, sesión realmente expirada, screen reader y mobile real siguen pendientes. Véase [cobertura](08_ASSISTANT_E2E_COVERAGE.md).
