# Decisión de refinamiento

Se elige Caso A: ampliar la aceptación del requisito existente `Complete abbreviated evolution timestamps` con una colisión de fecha/minuto en listas consultadas. Se añade 5.5 a C5. No se crea C7: no hace falta una entrega independiente para una corrección local del renderer.

## Alcance mínimo

Cada enlace válido de un resultado consultado se diferencia visualmente y por su nombre accesible cuando coincide la fecha presentada. Un ordinal estable mientras esa lista permanezca igual es una opción suficiente; no es una prioridad clínica, fecha nueva o identificador persistente. Se conserva el ID y el destino exacto, fecha original, interpretación de zona horaria y orden del payload. No se pide preview clínico ni se modifica backend, SSE, API o persistencia.

Ownership: `EvolutionListResult`; pruebas existentes `EvolutionListResult.test.tsx` y browser sintético. Reutilizar Link y formatter actuales, sin componentes abstractos nuevos. No ampliar headings de artefactos a este renderer por esta decisión.

## Ejecución futura, no realizada

- RED: reproducir al menos dos IDs con igual fecha/minuto, además de horas diferentes, estado vacío y filas inválidas. Assert de textos visibles, nombres accesibles distintos y href correctos. Confirmar procedencia C0 antes de atribuirlo al build de implementación.
- GREEN: identificación local usando únicamente datos actuales; ordinal si no existe contexto seguro. Sin fetch, métricas inventadas, timestamps modificados ni acciones de escritura.
- REFACTOR: limpieza localizada solo si el mínimo la requiere; sin nuevo framework de listados.
- VERIFY: component tests, snapshot accesible, teclado, desktop/tablet/mobile, 360 px, zoom real 200% y reduced motion. Comprobar destino exacto y ausencia de solicitudes clínicas/provider adicionales. Mantener contexto y semántica temporal.

## Grafo

```text
Continuidad externa -> C0 procedencia
                      -> C1 ->\
                      -> C2 ---> C6 -> Integrated 6.1 -> 6.2 -> 6.3
                      -> C3 ---> /
                      -> C4 --->/
                      -> C5 (5.1 -> 5.2 -> 5.3 -> 5.4 -> 5.5) --/
```

C1–C5 comparten C0 como prerrequisito y se ejecutan serialmente por la instrucción de un solo contexto. C6 depende de los cinco. La adición no introduce dependencia de C5 sobre C6 ni ningún ciclo. Los IDs y estados existentes permanecen iguales.

## Backlog separado, fuera de esta spec

| Candidato | Área / owner | Qué falta |
| --- | --- | --- |
| PMAX-003 | AppShell + DriveBootstrapBanner | Reproducción del shell en modos conectados/desconectados y navegaciones compartidas, foco y regresión de altura; futura spec propia |
| PMAX-005 | Patients + PatientDirectoryResults | Validar uso de filtros y densidad antes de disclosure; no reemplazar tabla desktop |
| PMAX-001 previews | Clinical read-result boundary | Autorizar cambio de payload y política de contenido; separado del ordinal local |
| PMAX-002 | ClinicalThreadList + ConversationRow | Definir pista secundaria segura, privacidad y necesidad real; ningún cambio autorizado ahora |

## Archivos OpenSpec modificados

`proposal.md`, `design.md`, `tasks.md` y `specs/clinical-agentic-feedback/spec.md`. Se añade un escenario, una tarea sin marcar y referencias de verificación. No se modifican los otros dos delta specs. Validación y conservación de contratos se registran en `evidence/document-validation.json` y `evidence/openspec-validation.txt`.
