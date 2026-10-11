# Evidencia sintética

Las capturas guardadas contienen únicamente datos fabricados para la auditoría. La sesión nativa no produjo archivos con nombres, contactos, RUT o notas reales.

## Reproducción

Usar el Chrome instalado y una sesión nueva, sin cookies/perfil existente:

```powershell
playwright-cli -s=pmax-independent open about:blank
playwright-cli -s=pmax-independent run-code --filename=docs/design/audits/assistant-independent-uiux-pro-max-2026-10-10/evidence/install-fixtures.js
playwright-cli -s=pmax-independent --raw run-code --filename=docs/design/audits/assistant-independent-uiux-pro-max-2026-10-10/evidence/browser-matrix.js
playwright-cli -s=pmax-independent --raw run-code --filename=docs/design/audits/assistant-independent-uiux-pro-max-2026-10-10/evidence/interactions.js
playwright-cli -s=pmax-independent --raw run-code --filename=docs/design/audits/assistant-independent-uiux-pro-max-2026-10-10/evidence/targeted-checks.js
playwright-cli -s=pmax-independent close
```

Todos los endpoints `/api/**` se cumplen localmente y ninguna solicitud desconocida de escritura alcanza el backend. Las fixtures no llaman modelos, DB, OAuth o Drive. No probar acciones reales en la sesión nativa.

`browser-matrix-result.json` contiene geometría y controles; `interactions-result.json` contiene snapshots accesibles y foco; `targeted-checks-result.json` contiene cajas del solapamiento y assets servidos. Los logs registran método/path, sin cuerpos ni secretos. Requests como búsqueda POST son respuestas sintéticas y no escritura real.

## Inspección de imágenes

Se inspeccionaron visualmente los cinco tamaños del Asistente, tabla/filas de Patients, destino de evolución, Resumen/Información, picker, búsqueda, Drive móvil/desktop, vacío/error de pendientes y reflow reducido. No inferir cobertura de teclado o lector de pantalla completa de un snapshot.

`patient-clinical.png` corresponde al intento de una fixture incompleta de Diagnóstico. Se conserva con esta advertencia y no sustenta ningún finding. Las capturas finales de matriz reemplazaron frames transitorios de responsive; 400 ms permiten estabilizar layout antes de medir.

`independent-freeze.json` acredita los hashes de los documentos independientes antes de la reconciliación. `spec-before.json` y `git-status-before-refinement.txt` conservan el estado previo al refinamiento para comparar documentación existente. No se sobrescriben auditorías anteriores.
