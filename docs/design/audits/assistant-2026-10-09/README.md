# Auditoría del Asistente clínico

9 de octubre de 2026 · `feat/ai-assisted-evolutions` · Checkout `7345f7a2e762220a19c638709e85d1b92ca70fed`.

**Recomendación:** corregir continuidad y recuperación antes de rediseñar. Se identificaron seis problemas P1, dos gaps P2 observables y dos propuestas UX P2. No hubo implementación ni escrituras clínicas/Drive reales.

## Informes

1. [Crítica UX](01_ASSISTANT_UX_CRITIQUE.md)
2. [Auditoría técnica y reproducciones](02_ASSISTANT_TECHNICAL_AUDIT.md)
3. [Inventario de flujos y estados](03_ASSISTANT_FLOW_INVENTORY.md)
4. [Reporte Playwright headed](04_PLAYWRIGHT_E2E_REPORT.md)
5. [Propuesta Shape](05_ASSISTANT_UX_SHAPE_PROPOSAL.md)
6. [Plan por slices](06_ASSISTANT_IMPLEMENTATION_PLAN.md)
7. [Trazabilidad](07_ASSISTANT_TRACEABILITY_MATRIX.md)
8. [Cobertura A01–A24 y pendientes](08_ASSISTANT_E2E_COVERAGE.md)

## Lo importante

- **F01:** Stop tardío del hilo A aborta la suscripción de B y resetea su transcript local. No se demuestra cancelación del turno backend B.
- **F04:** campo editado sin Aplicar se pierde al ir a Pendientes y volver.
- **F05:** Escape cierra aprobación autoabierta y deja revisión sin controles visibles hasta recarga.
- **F02/F03:** quitar paciente conserva nota/adjunto sin frontera explícita y puede ocultar paciente histórico del artefacto.
- **F06:** fallo transitorio de guardado se presenta como expiración y no ofrece recuperación local; reload permite continuar.

F01/F04/F05 fueron reproducidos con checkout JS compilado. F02/F03/F06 se observaron con bundle servido y sus causas se contrastaron estáticamente con checkout; rerun checkout sigue pendiente para esos tres. No agruparlos como igual nivel de evidencia.

## Evidencia y procedencia

[evidence/](evidence/) contiene screenshots con datos sintéticos, scripts de interceptación, resultados, build de paridad y output de 70 tests existentes. El usuario autenticó manualmente; no se guardó estado de autenticación. La cuenta visible en fixtures es `audit@example.invalid`.

El bundle servido no hash-coincide con checkout. Se compiló en `evidence/build-parity` y se interceptó la carga de assets para las reproducciones posteriores. El servicio Docker no fue reconstruido. La copia generada de JS retenida fue sanitizada al cierre para retirar una clave pública de Google Picker. No es byte-idéntica al build probado; [provenance](evidence/build-parity-provenance.json) guarda hashes original y sanitizado sin la clave. Picker no se ejercitó. [Reporte](04_PLAYWRIGHT_E2E_REPORT.md) documenta qué pruebas usan cada bundle.

Cinco viewports observados: 1440×900, 1024×768, 768×1024, 390×844, 360×800. No root overflow en muestras chat/Drive; keyboard virtual/hardware móvil no probado. Un probe touch coarse encontró controles 40px frente a objetivo interno 44px; no es por sí mismo un fallo WCAG 2.5.8.

Assessment A precedió al detector. Detector `[]` no significa UX o WCAG aprobados. No hubo subagentes disponibles; la crítica fue secuencial en un solo contexto.

`setup-result.txt` está vacío y no prueba setup. `history.png` corresponde a intento preliminar; `long-history.png` y `transport-result.txt` contienen el caso corregido de 61 grupos. `touch-measurements.json` es una medición preliminar pointer fino con elementos offscreen; usar `coarse-touch.json` para targets. `console-command.txt` registra cero warnings/errors en la consulta final, no en toda la sesión.

## Qué pasó y qué no se cerró

**Confirmado con fixtures:** cierre Drive preserva draft/stream/foco; queue cap conserva cuarta entrada; voz exitosa respeta edición concurrente/selección y no autoenvía; transporte reconcilia; guardado clínico y fallo export tienen estados separados.

**Pendiente o bloqueado:** DB/save reales, ownership dos usuarios, idempotencia/two tabs, modelo real, OAuth/reconnect, Drive unknown/conflicto/dirty, auth realmente expirada, server restart, screen reader, contraste exhaustivo, zoom/mobile real y performance LCP/INP/CLS. Auditoría estática o mock pass no cierra esos gates.

## Compatibilidad y cambios

Se conserva el audit de [Pacientes](../patients-2026-10-08/README.md) y su D04. Esta propuesta no reintroduce planes en Pacientes ni modifica producción, contratos, schemas, migraciones, datos o credenciales.

Los archivos creados por esta auditoría están exclusivamente dentro de esta carpeta. No se hizo commit ni deploy. Se actualizó únicamente el bundle de evidencia ya staged para retirar la clave también del index; no se alteró el staging de otros archivos. La verificación final de [evidence/document-verification.json](evidence/document-verification.json) revisa entregables, enlaces locales y separación de cambios de aplicación; [evidence/manifest.json](evidence/manifest.json) registra hashes para evidencia.

El plan requiere autorización humana. Orden recomendado: scope de Stop, buffer dirty y revisión recuperable; luego identidad/contexto, recovery save y mejoras P2. No iniciar implementación a partir de este README sin esa autorización.
