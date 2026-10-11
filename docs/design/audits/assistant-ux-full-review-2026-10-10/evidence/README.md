# Evidencia de la corrida

Capturas JPEG originales del navegador nativo, sin edición de imagen. 01–03 corresponden al servidor autenticado localhost:8000; el resto al dist existente servido por fixtures aislados. El contenido clínico/pacientes/documentos guardados en evidencia es sintético o enmascarado. La captura desktop inicial que mostraba el email real se eliminó y se sustituyó por 02 safe; no se conserva ni se utiliza como evidencia.

## Capturas autoritativas

| Archivos | Qué permite comprobar |
|---|---|
| [01 entrada](01-assistant-entry-native.jpg), [02 desktop](02-assistant-desktop-safe.jpg), [03 Drive](03-drive-no-patient.jpg) | Servidor real; entrada segura y documentos sin paciente |
| [04 paciente](04-patient-selected-current.jpg) | Nombre sintético y RUT masked |
| [05 guard](05-context-guard.jpg), [35 guard móvil](35-mobile-context-decision.jpg) | Acciones unidas, jerarquía y decisión de origen |
| [06 origen](06-retained-context.jpg) | Borrador conservado para Ana y etiqueta general |
| [07 artefacto](07-artifact-current.jpg), [08 editor](08-artifact-edit-evidence.jpg), [09 retorno](09-editor-restored.jpg) | Evidencia y buffer entre hilos |
| [10 confirmación](10-approval-dialog.jpg), [11 dismissal](11-approval-dismissed.jpg) | Review/duplicación del dock; cierre y foco en snapshot |
| [12 fallo](12-save-failure.jpg), [13 recuperación](13-draft-recovered.jpg) | Error duplicado y draft recuperable |
| [14 preview](14-drive-note-preview.jpg), [15 adjunto](15-document-attached.jpg) | Documento fixture y contexto siguiente mensaje |
| [17 guardada inyectada](17-saved-ui-drive-separate.jpg) | Render de estado, no commit |
| [18 vacío](18-pending-empty.jpg), [19 categorías](19-pending-categories.jpg), [20 retry](20-pending-after-retry.jpg) | Paginación y pérdida de páginas cargadas |
| [21 cola](21-stream-queue-full.jpg), [23 Stop móvil](23-mobile-queue-after-stop.jpg) | Loading stream/cola y siguiente dispatch, draft conservado |
| [24 overlay](24-mobile-drive-overlay.jpg), [25 docs](25-mobile-drive-no-patient.jpg), [39 diarios](39-drive-journals-empty.jpg) | Secciones Drive y vacío; sin modificar preferencia |
| [26 360px](26-assistant-360.jpg), [37 768px](37-assistant-768-settled.jpg), [38 1024px](38-assistant-1024-settled.jpg) | Estados estables responsive |
| [29 contextual](29-patient-contextual-desktop.jpg), [30 input](30-contextual-composer-narrow.jpg), [32 Sheet](32-contextual-tablet.jpg) | Escritura estrecha en panel/Sheet |
| [31 continuidad](31-full-assistant-context-retained.jpg) | Nota intacta al abrir Assistant completo |
| [33 manual](33-new-evolution-entry.jpg), [34 mobile ficha](34-mobile-patient-assistant-route.jpg) | Captura manual y ruta completa mobile |
| [36 error carga](36-load-error-empty-fallback.jpg) | Mensaje de fallo compite con bienvenida |
| [40 aplicar](40-artifact-applied.jpg) | Campo aplicado contra API fixture, Cambios guardados |
| [41 confirmar](41-fixture-confirmed-save-drive-failure.jpg), [42 retry](42-fixture-drive-retry.jpg) | Intención consistente confirmada; copia separada cambia estado |

Snapshots .txt contienen estado/roles/labels; el foco concreto y métricas están en browser-observations.json, native-browser-checks.json y mediciones JSON. Para 40–42 CSS viewport fue 1280×720 (captura nativa), no se añadieron a la matriz primaria de viewport.

## Excepciones y procedencia

[16](16-approval-fixture-inconclusive.jpg) es una simulación inconclusa por IDs del adaptador; no debe usarse para afirmar guardado ni bug de producto. 22-mobile-queue-cap, 27-assistant-768 y 28-assistant-1024 son frames transitorios durante resize; las referencias estables son 23/37/38. El reloj artificial del fixture de stream no representa latencia real.

- provenance.json: HEAD, assets locales SHA256 y filenames live; no rebuild en esta corrida.
- git-status-before.txt / git-status-after.txt y final-verification.json: límites del cambio.
- native-fixture-server.cjs: evidencia auxiliar, sólo loopback/CSP local, sin browser automation, proxy, DB o provider.
- fixture-scenario.json: último escenario; cambiarlo sólo para una reproducción aislada.
- fixture-request-log-part1/part2/part3.json y fixture-request-log.json: sólo método/ruta/scenario sintéticos; no cuerpos, cookies o tokens.
- assessment-A.md: crítica antes del detector.
- impeccable-detector.json: seis warnings estáticos, filtrados en informe.
- browser-observations.json: resultados y exclusiones, incluida repetición consistente de confirmación.
- contextual-input-measurement.json: textarea 24.85px.
- context-decision-measurement.json: botones 21px, gap0, foco externo y ARIA.
- run-notes.md: método/fallback/limpieza.
- verify-audit.py: comprobación documental, sin suite app.
- artifact-manifest.json: hashes de entregables/evidencia, para integridad después de esta corrida.

## Reproducción segura

El adaptador requiere el harness integrado existente y app/frontend/dist de los hashes documentados. No es una dependencia instalada ni modificación de app. Ejecutar node sobre el adaptador sólo en una revisión sintética aislada y detener con Ctrl+C; puerto127.0.0.1:5311. Ninguna ruta desconocida se reenvía al servidor real. UI se conduce con navegador nativo.

Los builders importados tienen algunos IDs/fechas fijos; validar consistencia action/artifact antes de evaluar un caso. Este adaptador no reemplaza integración backend ni pruebas del cambio activo. Los logs incluyen solicitudes fallidas de escenarios controlados; una respuesta fixture no valida comportamiento del backend.

