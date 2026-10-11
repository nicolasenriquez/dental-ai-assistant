# Inventario independiente

Fecha local: 2026-10-10, America/Santiago. Rama `feat/ai-assisted-evolutions`, HEAD `4957faf3ca38079ac0745f0b234e8ef9bd69b5ad`, origin `nicolasenriquez/dental-ai-assistant`.

## Entornos y seguridad

El navegador nativo de Codex estaba autenticado en `localhost:8000/patients`. Se observaron Patients y la entrada del Asistente. La procedencia de sus datos no se confirmó; no se guardaron capturas ni identificadores de esa sesión. Se volvió a Patients al terminar. La navegación hacia `/assistant` puede invocar `POST /clinical-threads/acquire` automáticamente según el código. No se verificó si reutilizó o creó un hilo; no se repitió ese recorrido en la sesión real. No hubo envíos explícitos, aprobaciones, cambios de paciente, exportaciones ni borrados.

Playwright CLI 0.1.19 controla una sesión separada `pmax-independent`, sin copiar cookies, perfiles ni secretos. Su primer lanzamiento falló por Crashpad dentro del sandbox; el Chrome ya instalado arrancó con acceso al host. Todas las rutas `/api/**` se interceptaron antes de abrir la aplicación. La identidad, pacientes y registros son sintéticos. Las escrituras no reconocidas responden 409 y ningún interceptor llama `route.fetch` o `route.continue`. El log no guarda cuerpos. Los recursos estáticos se sirven desde el runtime local existente.

## Cobertura real

| Pantalla o interacción | Herramienta | Cobertura |
| --- | --- | --- |
| Patients, entrada del Asistente, historial existente | Codex nativo | Lectura; sin evidencia persistida con datos personales |
| Asistente con 25 hilos y 12 evoluciones | CLI sintético | 1440, 1024, 768, 390 y 360 x 900 CSS px |
| Selector de paciente, Escape y retorno de foco | CLI sintético | 1440 x 900; sin seleccionar ni cambiar paciente |
| Búsqueda de conversaciones | CLI sintético | Apertura del control, sin evaluar relevancia de búsqueda |
| Drive desconectado, panel y Escape | CLI sintético | 1440 x 900 y 390 x 844; sin OAuth |
| Enlace de evolución a ficha | CLI sintético | Selección correcta y vista de detalle a 1440 x 900 |
| Ficha: Resumen e Información | CLI sintético | Lectura; sin abrir acciones de escritura |
| Patients tabla y filas móviles | CLI sintético | 1440 x 900 y 390 x 844, dos pacientes, un nombre largo |
| Patients búsqueda sin coincidencias | CLI sintético | Estado vacío con consulta sintética |
| Pendientes vacío y error 503 | CLI sintético | Ruta `/assistant?view=pending`; reintento no pulsado |
| Reflow y reduced motion | CLI sintético | 720 x 450; aproximación de reflow, no zoom real de 200% |

No se evaluaron dispositivos físicos, lectores de pantalla, zoom real, contraste completo, flujo de dictado, modelos, guardado, recuperación clínica, aprobación, Drive conectado, exportaciones o listas paginadas grandes. Diagnóstico recibió una respuesta sintética incompleta y produjo un error; no se atribuye a la aplicación. `patient-clinical.png` es evidencia de un intento excluido, no de un defecto. Odontograma, tratamientos y planes no están verificados.

## Procedencia del runtime

Los assets observados son `/assets/index-hMjYLKeb.js` y `/assets/index-BzakEpcP.css`. No se reconstruyó Docker ni se demostró igualdad binaria entre ese bundle y HEAD. Las explicaciones de código se marcan SOURCE-CONFIRMED por separado; no equivalen a demostrar paridad de build. Los snapshots nativos y CLI no comparten sesión.

## Evidencia reproducible

`evidence/install-fixtures.js`, `browser-matrix.js`, `interactions.js` y `targeted-checks.js` son funciones compatibles con `playwright-cli run-code --filename`. Se ejecutan en ese orden en una sesión nueva. Sus resultados JSON y PNG contienen solo datos sintéticos. Las capturas finales esperan 400 ms para que los efectos responsive y las transiciones se estabilicen. Se descartaron conclusiones basadas en capturas transitorias.
