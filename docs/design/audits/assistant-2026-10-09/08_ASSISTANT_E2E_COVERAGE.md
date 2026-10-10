# Cobertura A01–A24 y gaps

2026-10-09 · Read-only audit. **No hay declaración de E2E clínico real completo.**

## Leyenda

- **PASS-F:** conducta observada con fixture de navegador, no integración backend real.
- **FAIL-F:** defecto/limitación observable con fixture.
- **PARCIAL:** parte del flujo observada; otras transiciones sin ejecutar.
- **BLOQUEADO-R:** integración real bloqueada por falta de aislamiento/autorización; no se intentó.
- **I/T:** fuente o tests existentes complementan, sin sustituir E2E.

«Observado» no significa que todo el escenario pasa. Los resultados mixtos preservan lo que funcionó y lo que falló. La clasificación de cada celda no se suma a un porcentaje engañoso.

## Matriz principal

| ID | Escenario | Estado frontend | Evidencia | Pendiente / real |
|---|---|---|---|---|
| A01 | Login manual y entrada Asistente | PASS-F para navegación posterior | Chat screenshots; setup-result vacío no aporta evidencia | Auth real ya abierta; no credenciales/password flow automatizado |
| A02 | Nuevo hilo/estado vacío | PARCIAL | `empty-1440.png`, starter UI | Creación persistida real bloqueada; write endpoint fixture |
| A03 | Paciente seleccionado visible | PASS-F | Chat/artefacto screenshots | Ownership dos usuarios: I, no backend browser test |
| A04 | Cambiar/quitar paciente con trabajo | FAIL-F | `edit-context-result.txt`, `draft-without-patient.png` | F02/F03; rerun checkout pendiente; save paciente equivocado no demostrado |
| A05 | Texto largo + Drive abre/cierra | PASS-F | `browser-matrix-result.txt`, `chat-*` | Teclado móvil real pendiente |
| A06 | Stream sintético y actividad | PASS-F | `streaming.png`, fixture results | Modelo/proveedor real BLOQUEADO-R |
| A07 | Cambio de hilo + callback tardío | FAIL-F | `stop-race-result.txt` checkout | F01; no afirmar cancelación backend B |
| A08 | Cola tres/cap cuarta | PASS-F | `clinical-matrix-result.txt`, `queue-cap.png` | Persistencia a reload/two tabs no probada |
| A09 | Stop + cola | MIXTO: PASS-F semántica actual / FAIL-F race | `stop-queue.png`, `stop-race-result.txt` | F07 opcional copy; F01 bug scoped |
| A10 | Queue patient mismatch | MIXTO: detecta / recuperación null incompleta | `clinical-matrix-result.txt` | F08; regla de global note D01 |
| A11 | Voz denegada | PASS-F | `voice-denied.png` | Browser/hardware permiso real multidevice pendiente |
| A12 | Voz exitosa y edición concurrente | PASS-F | `voice-success-result.txt`, `voice-patient-result.txt` | Audio sintético/transcripción fixture; calidad STT real bloqueada |
| A13 | Drive layout, close, resize, trap | PASS-F en operaciones probadas | `browser-matrix-result.txt`, `keyboard-result.txt` | Dirty-save/cancel/conflict/reconnect no cubiertos end-to-end |
| A14 | Selección Drive → attachment | PASS-F / riesgo cambio contexto | `attachment.png`, `attachment-patient-removed.png` | Proveedor/file permissions reales bloqueados |
| A15 | Artefacto hidrata y conserva contexto | MIXTO: visible / F03 | `draft.png`, `draft-without-patient.png` | Generación y persisted real draft BLOQUEADO-R |
| A16 | Editar/revisar/Escape | FAIL-F | `checkout-edit-result.txt`, `checkout-escape-result.txt` | Aplicar/cancelar toda variante y autosave races parcialmente inferidos |
| A17 | Confirmar y guardada en ficha | PASS-F UI / BLOQUEADO-R DB | `recovery-result.txt`, `saved-drive-failed.png` | Transacción real/hash/idempotency no ejecutados |
| A18 | Error guardado y retry | FAIL-F recovery local | `recovery-result.txt`, `save-error.png` | F06 servido; checkout rerun y fallos before/after commit pendientes |
| A19 | Guardada + export falla | PASS-F independencia estados | `saved-drive-failed.png` | Retry remote/unknown/reconnect real BLOQUEADO-R |
| A20 | SSE error/GET recovery/403 | PASS-F | `transport-result.txt`, `transport-reconciled.png` | SSE real/dropped network/server restart pendiente |
| A21 | 401 y reauth | PARCIAL | `session401-result.txt` | Auth mock devuelve usuario; termina `/patients`, no login real. Draft survival no cerrado |
| A22 | Historia larga/scroll | PASS-F caso probado | `transport-result.txt`, `long-history.png` | 61 grupos; llegada nueva mientras lee, hydration restore y perf instrumentada pendientes |
| A23 | Asistente contextual ficha | PASS-F entrada desktop | `contextual-result.txt`, `contextual-desktop.png` | Draft transition contextual/global y save real pendientes |
| A24 | Responsive/a11y/foco/motion | PARCIAL; F10 targets | `chat-*`, `drive-*`, `artifact-*`, `keyboard-result.txt`, `coarse-touch.json` | Screen reader, contraste, zoom real, keyboard mobile pendientes |

## Concurrencia y errores: lo observado vs lo que falta

| Combinación | Estado | Resultado / próximo test |
|---|---|---|
| Cerrar Drive + stream activo + draft | PASS-F | No aborta/pierde; foco retorna |
| Texto largo + queue full | PASS-F | Cuarta entrada se conserva |
| Stop actual + cola | PASS-F semántica existente | Cola continúa; copy propuesta |
| Stop A demorado + hilo B stream | FAIL-F checkout | F01: B subscriber aborta/transcript resetea |
| Editar campo + navegar Pendientes | FAIL-F checkout | F04: buffer sin Aplicar perdido |
| Escape review + same view | FAIL-F checkout | F05: trigger oculto hasta reload |
| Voice recording + patient change | PASS-F | Guard protege selección |
| Voice transcription + texto concurrente | PASS-F | Inserción en selection previa y foco |
| Patient removal + attachment | FAIL-F contextual | No frontera; datos preservados pero contexto ambiguo |
| Save failure + reload retry | FAIL-F recovery inicial / PASS-F después reload | F06; no resultado DB real |
| SSE transport error + persisted fixture | PASS-F checkout | Hydration restaura respuesta |
| 403 + unsent draft | PASS-F checkout | Mensaje seguro, draft conservado |
| 401 + auth real expirado | BLOQUEADO-R | Solo ruta reauth sintética observada |
| Autosave draft + prepare approval | PENDIENTE | Demorar PUT y preparar; hash/version canonical |
| Double submit/two tabs | PENDIENTE | Backend transactional tests + UAT sintético |
| Drive dirty doc + close/change section | PENDIENTE | Preservar buffer y confirmación de descarte |
| Drive pending/syncing/unknown + navigate | PENDIENTE | Recovery POST guarded; unknown verify-only |
| Drive conflict/ambiguous remote write | BLOQUEADO-R | Docs sintéticos, markers y tuple immutable |
| Server restart + active turn | PENDIENTE/I | In-process runner no demuestra restart-durability |
| History reading + new turn arrival | PENDIENTE | Jump button visible/focus; no scroll forzado |

## Matriz responsive

| Estado | 1440×900 | 1024×768 | 768×1024 | 390×844 | 360×800 |
|---|---|---|---|---|---|
| Chat/texto | Capturado/medido | Capturado/medido | Capturado/medido | Capturado/medido | Capturado/medido |
| Drive abierto | Capturado/medido | Capturado/medido | Capturado/medido | Capturado/medido | Capturado/medido |
| Artifact draft | Capturado | Capturado | Capturado | Capturado | Capturado |
| Queue full | No matriz completa | No matriz completa | No matriz completa | Probe móvil específico | Probe móvil específico |
| Voz hardware/teclado virtual | No | No | No | No | No |
| Pointer coarse | No medición específica | No | No | No | Medido: varios targets 40px |

No root overflow en muestras chat/Drive. Captura responsive no prueba foco, keyboard, contraste, touch o lectura con screen reader por sí sola.

## Pruebas y detector

- **70 tests existentes PASS**: hook clínico, runtime provider, área, compositor y voz. Artefacto approval/save edge cases requieren regresiones dedicadas.
- **Build checkout PASS** en carpeta evidence. No deploy/rebuild de servicio.
- **Detector `[]`**: no hallazgos del detector; no prueba a11y completa.
- **Backend/lint/typecheck suite completa NO EJECUTADA** durante este audit sin cambios de aplicación.

## Cierre requerido para release futura

1. Corregir y agregar tests F01–F06; rerun F02/F03/F06 checkout.
2. Ejecutar matriz fixtures completa con assertions reproducibles y harness que falla cerrado.
3. UAT aislado autorizado: DB save, idempotency, owner isolation, Drive failure/unknown/reconnect.
4. Screen reader y contraste/zoom; mobile real con keyboard/voz.
5. Performance instrumentada antes de optimización estructural.

Este reporte permite priorizar bugs de frontend; **no autoriza release ni uso de datos reales**.
