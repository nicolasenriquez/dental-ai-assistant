# UAT del flujo humano del odontograma

Fecha: 6 de octubre de 2026. Cambio: `harden-odontogram-human-workflow`.

**Resultado: requiere correcciones.** La persistencia y los flujos principales funcionan, pero tres requisitos de aceptación no se cumplen completamente: R7, R8 y R9. No se modificó código de producto durante este UAT.

## Entornos y alcance

- **Aplicación autenticada real, browser nativo de Codex:** `http://localhost:8000`. Se creó, con autorización, el paciente **UAT Sintético Odontograma 20261006**, UUID `69d83fe1-dcbd-4ca8-b946-ba7941b0c5cf`. Se conserva junto con su historial. Las condiciones se crearon, editaron, resolvieron y corrigieron mediante la UI; las carreras usaron dos pestañas reales del mismo propietario.
- **Playwright CLI, aplicación y Postgres desechables:** `http://localhost:8002`, Compose `odontogram-uat-20261006`. Usa la misma imagen reconstruida que localhost:8000; autenticación local y modelos/Drive desactivados. La cuenta de prueba se preparó por HTTP, el primer paciente por UI y los datos volumétricos por HTTP. No se afirma haber probado Google OAuth o proveedores externos en este entorno.
- **Pruebas de contrato y SQL:** 45 pruebas seleccionadas aprobadas, 8 excluidas por filtro y **cero skips**. Incluyen 25 casos seleccionados de `test_clinical_workspace_live.py` contra el Postgres desechable migrado. Las pruebas HTTP que usan el stub habitual se distinguen de los casos SQL reales.
- **Pruebas de componentes/presentación:** 76 aprobadas en 5 archivos. Son pruebas con fixtures, complementarias al UAT; no sustituyen persistencia real.

La revisión inicial encontró un frontend desplegado anterior al cambio. Su bundle era `index-CLj96h5K.js`; Clínica no persistía la URL y el filtro iniciaba en Todas. Con autorización se reconstruyó y recreó **solo app-blue**, conservando Postgres y su volumen. El servidor pasó a servir `index-DSR53gKb.js`. La sesión nativa conservaba HTML anterior en caché; una URL nueva confirmó la carga del bundle actual. Los hallazgos siguientes se observaron después de esta actualización.

## Hallazgos pendientes

### UAT-01 · P2 · R7: el textarea móvil no crece y empieza con menos de cuatro líneas útiles

En 390×844 y 430×932 CSS px, editar una nota corta muestra un textarea de **90 px**, fuente de 16 px, interlineado de 22,4 px y padding vertical de 22,5 px. Su área útil permite aproximadamente tres líneas. Al introducir una nota larga, la altura sigue en 90 px y `scrollHeight` aumenta a 605/537 px: el scroll interno comienza sin crecimiento previo.

El browser declara soporte de `field-sizing: content`, pero el estilo computado del textarea es **`field-sizing: fixed`**. `useAutosizeTextarea` deja de calcular la altura cuando detecta soporte de la propiedad, aunque este control no la activa. El control además usa `min-h-24`, que con el tamaño raíz observado equivale a 90 px.

Fuentes: `app/frontend/src/hooks/useAutosizeTextarea.ts:19` y `app/frontend/src/components/patients/PatientDiagnosis.tsx:1077`.

Reproducción: abrir una condición, pulsar Editar condición, escribir una nota corta y luego una de aproximadamente 900 caracteres en cualquiera de esos dos tamaños. Comparar altura y scroll.

Corrección mínima propuesta: activar realmente el dimensionamiento por contenido o conservar el cálculo JS cuando el estilo computado siga siendo fixed; establecer una altura inicial que aloje cuatro líneas más padding/bordes. Revalidar crecimiento hasta un tercio del viewport y scroll posterior. No se implementó durante esta auditoría.

### UAT-02 · P2 · R8: comparación incompleta respecto de la especificación

Una carrera real con superficies remotas y nota local conserva correctamente ambos cambios. Una carrera sobre la misma nota bloquea Guardar hasta elegir Mantener mi nota o Usar nota actual; una segunda carrera renueva la decisión. **No se observó pérdida de datos.**

Sin embargo, la UI muestra **Tuyas/Actuales**, sin mostrar los valores **Base** que exige R8. En el caso disjunto, Guardar vuelve a estar habilitado sin una elección explícita para el campo modificado localmente; la elección solo se exige cuando ambos lados cambiaron ese mismo campo.

Fuentes: `PatientDiagnosis.tsx:181`, `PatientDiagnosis.tsx:1143` y `PatientDiagnosis.tsx:1176`. La implementación guarda una base interna, pero no la presenta; el cálculo de elecciones combina cambio local **y** remoto.

Corrección mínima propuesta: mostrar base/local/actual y exigir la elección prevista por R8 para cada campo localmente modificado. Los campos locales no modificados deben seguir tomando el valor actual del servidor. Hay una discrepancia entre la aceptación normativa y las notas de implementación que describen auto-merge disjunto; los tests existentes verdes no la resuelven.

### UAT-03 · P2 · R9: abrir un registro/historial no persiste su UUID en la URL

Después de corregir un registro, abrir Ver registro original o Historial de condición enfoca el recurso, pero la URL sigue conteniendo solo `tab=clinical&clinical=diagnosis` y los parámetros seguros previos. No agrega `condition=<UUID>`.

Al recargar, Diagnóstico se conserva, pero vuelve al filtro Actuales y se pierde el registro/historial enfocado. En el paciente UAT, cuyos tres registros terminaron corregidos, la recarga muestra Sin registros actuales y cero historiales abiertos.

El **deep link construido con un UUID válido sí funciona** y muestra el recurso histórico. El defecto está en publicar ese contexto desde las acciones de UI. `PatientDetail.tsx:431` pasa el parámetro a Diagnóstico; el componente no recibe un callback para devolver cambios de foco a la URL.

Corrección mínima propuesta: comunicar al dueño de la navegación el recurso activado/confirmado y persistir su UUID mediante los guards existentes; al salir de Diagnóstico, retirar el parámetro como ya hace el cambio a Evoluciones. Añadir una prueba UI → historial → recarga, no solo una prueba que inicia con el parámetro ya escrito.

## Cobertura por requisito

| Requisito | Resultado de esta sesión | Evidencia y límite |
| --- | --- | --- |
| R1 Corrección separada de resolución | Aprobado en escenarios ejecutados | UI real: 16→26 con reemplazo; original resuelto sin reemplazo; motivo obligatorio; review antes del POST; cancelación de review conserva borrador. |
| R2 Atomicidad y ownership | Aprobado en pruebas ejecutadas | Duplicado 409 deja original active/revisión 1; contratos SQL reales cubren rollback, UUID, acceso extranjero, overlap y validación. El segundo signup CLI recibió 429, por lo que ese segundo-owner browser/API particular no se ejecutó. No se eludió la guardia; ownership se probó en los casos live. |
| R3 Revisión y retry | Aprobado en escenarios ejecutados | CLI hace commit real y pierde solo la respuesta; el retry conserva body/operation y termina con una sola revisión corregida. Casos live cubren receipts, replay incompatible y carreras. |
| R4 Lectura actual/histórica | Aprobado en escenarios ejecutados | Actual por defecto, error fuera de actuales, enlaces original/reemplazo, historial conservado y deep link histórico directo. URL generada por UI tiene el defecto UAT-03. |
| R5 Autor | Aprobado en escenarios ejecutados | Usuario con UUID persistido en registros/revisiones/Actividad; 13 eventos nativos concuerdan con 13 revisiones SQL. Colisiones/fallback mediante tests de componentes; no se inventa identidad profesional. |
| R6 Selección responsive | Aprobado con CLI a tamaños exactos | 1440×900, 1280×800, 1024×768, 768×1024, 430×932, 390×844; en cada uno se activaron 32 piezas permanentes y 20 temporales; targets ≥44×44 y sin overflow. Native también recorrió piezas, pero sus intentos de resize no se usan como evidencia de tamaños exactos. |
| R7 Editor compacto | **Incumplimiento UAT-01** | Pieza completa sin superficies y preview de 90 px pasan; font móvil 16 px pasa. Altura inicial y crecimiento de nota fallan. |
| R8 Conflictos | **Incumplimiento UAT-02** | Merge disjunto preserva datos; conflicto de misma nota y segunda carrera requieren elección; D-03 después de resolución concurrente funciona. Faltan base visible y decisión explícita disjunta según R8. |
| R9 URL/guards | **Incumplimiento UAT-03** | Tabs/subvista persisten, Evoluciones elimina condition, enums inválidos tienen default, UUID inválido no dispara GET, cancelar conserva draft/URL y descartar no escribe. Foco histórico generado por UI no persiste. |
| R10 Pruebas y paginación | Aprobado en alcance ejecutado | 45 tests con cero skips; SQL 50/51/500; UI 500 registros, 384 permanentes +116 temporales. Fallo en página posterior conserva 50, indica incompleto, nunca falso vacío; GET retry recupera 384. |
| R11 Boundary compartido | Revisado + tests | Endpoints delegan al servicio; SQL/locks permanecen en db. Los tests live verifican comportamiento de comandos; no se agregó adapter agente. |
| R12 Exclusiones | Revisado en alcance | No se cambió taxonomía, auth, Drive, aprobación de evoluciones ni herramientas agente. No hay certificación clínica o agent-ready. |
| R13 Guardado y feedback | Aprobado en escenarios ejecutados | Foco sobre resultado y revisión exacta; guardado con GET posterior fallido se recupera con una sola PATCH y retry GET. Retención de intentos inciertos probada; aislamiento de respuestas tardías cubierto por componentes. |
| R14 Símbolos/estados | Parcial | Estados textuales, leyenda, conteos y datos confirmados observados. No se realizó una certificación clínica independiente de todos los glyphs ni aceptación manual de toda la composición. |
| R15 Continuidad espacial | Aprobado en escenarios ejecutados | Ambos órdenes de selección, cuadrantes/anatomía, nota/pieza tras resize; Asistente abierto en 1440/1280/1024 mantiene targets y sin overflow. No se ejecutó cada estado de la matriz visual en cada tamaño. |
| R16 Catálogo | Aprobado en pruebas ejecutadas | Catálogo real de 12 códigos; matriz live catálogo/domain/SQL para ambas denticiones, superficies opcionales y extras prohibidos. |
| R17 Presentación/fallback | Aprobado en pruebas ejecutadas | Fallo de catálogo conserva hecho/código/nota con error explícito y retry GET. Extensión sintética, categorías, desconocidos y compatibilidad legacy mediante componentes/contratos, no nuevos códigos productivos. |

## Persistencia nativa comprobada

La lectura SQL se limitó al UUID del paciente UAT autorizado. Encontró **3 condiciones y 13 revisiones**, con una cadena original/reemplazo conservada:

- Original Caries 16: revisión 2, entered_in_error.
- Reemplazo Caries 26: revisión 3, entered_in_error; supersedes apunta al original. Incluye created, resolved y corrected.
- Nuevo registro Caries 26: UUID distinto, revisión 8, entered_in_error. Incluye las ediciones/carreras, resolución y corrección D-03.

Actividad mostró exactamente 13 eventos y no incluyó los motivos ni las notas de condición. Estos tres registros son evidencia sintética, no hallazgos de un paciente real.

## Accesibilidad y límites

Ocho pares de colores renderizados superaron 4,5:1; el mínimo medido fue **5,17:1**. Se comprobó foco sobre checkbox y activación con Space; hover no cambió pieza/nota/borrador. Esto no es una auditoría WCAG completa.

No se ejecutó un lector de pantalla real, un teclado virtual en dispositivo ni validación por un odontólogo. No se probaron proveedores externos. La matriz completa de todos los estados visuales en todos los tamaños sigue sin una aprobación exhaustiva, aunque el acceso a todas las piezas y tamaños exactos sí está cubierto. El pedido de UAT termina con una evaluación negativa sustentada; no se afirma que todos los escenarios de aceptación hayan pasado.

## Evidencia reproducible y cierre

Directorio local de prueba: `.playwright-cli/verification/odontogram-uat-20261006/`.

- `cli-layout-result.json`: tamaños CSS efectivos, FDI activados y targets.
- `cli-faults-result.json`: atomicidad 409, retry idéntico, GET-only, fallo de catálogo y textarea medido.
- `cli-navigation-panel-result.json`: deep links, URL inválida, guards y Asistente.
- `cli-volume-result.json`: 500 registros completos y recuperación de página fallida.
- `cli-accessibility-result.json`: contraste, foco, Space y hover.
- `native-db.json`, `native-activity-scoped.png`: conciliación con persistencia real de localhost:8000.
- `live-tests.log`: 45 aprobados, 8 excluidos, cero skips.
- `cli-*.js`: recetas ejecutadas por Playwright CLI `run-code --filename=...`; los scripts de preparación son de un solo uso y requieren el entorno desechable, no localhost:8000.

Los archivos `layout.json` y las capturas `layout-*.png` de los primeros intentos nativos no prueban dimensiones exactas; el informe usa exclusivamente `cli-layout-result.json` y `cli-layout-*.png` para R6. Los errores de esos intentos y las aserciones de prueba ajustadas no se contabilizan como errores del producto.

Se conserva el paciente nativo según la autorización recibida. Se cerró la pestaña de carrera; la ficha UAT queda disponible en el browser nativo. Se cerró el browser CLI y se eliminaron los contenedores, red y volumen del proyecto desechable; las consultas posteriores no encontraron contenedores ni volúmenes de ese proyecto. La evidencia queda en el workspace y localhost:8000 respondió HTTP 200 al finalizar. No se eliminaron volúmenes ni datos del stack compartido. No se hizo commit, sync ni archive de OpenSpec.
