# Auditoría live de fidelidad y protecciones actuales

Fecha2026-10-06. Boundary: dos pestañas autenticadas del browser nativo Codex, controles Playwright documentados, inspección DOM/CSS read-only y código fuente; contratos backend con Postgres propio migrado. No implementación del mirror ni writes clínicos en las fichas existentes.

## Recorrido observado

DentalPin: Clinical→Diagnosis;8 categorías recorridas completas,72 opciones live; inspección16 sin herramienta abre popover con nombre y sin registros; seleccionar Caries cambia halo/dot; activar16 abre selector, seleccionar M/O habilita confirmación y Cancelar no aplica; leyenda cinco grupos/status; Primary muestra20 FDI y Permanent32; diagnóstico conserva9 condiciones; Treatment plans→detalle del plan activo muestra stepper,2/3 tratamientos, sesiones, acciones y notas. No se pulsó Confirm, Save, Mark completed, presupuesto ni agenda.

Notas source: pointer click de Notas abrió IA por solapamiento; se cerró IA y Enter sobre Notas abrió Sheet. Compositor muestra Attach to tooth16, Guardar vacío deshabilitado, plantillas y feed tipado; se escribió borrador sintético, desmarcó vínculo, añadió plantilla Caries (append verificado en textarea visible), luego Cancelar y Escape. Había dos textareas, una oculta. No hubo note POST. Asociación-hover/PATCH/delete se contrastó con código; no se cambiaron registros existentes de otros autores.

Dental AI: clínica/diagnóstico carga12 conceptos. Seleccionar16 sin herramienta crea borrador de código vacío, muestra Condición no reconocida, Cambiar pieza y foco en condition-note. Los12 iconos heredan rgb(148,163,184), carecen de diferenciación cromática clínica. Cancelar abre guard; Descartar devuelve Registrar condición y elimina el borrador sin guardar. No registra tratamientos/planes ni posee aún el rail de notas dentales. Source/direct chart y target/create editor son flujos distintos confirmados, no un problema resuelto por recolorear.

## Hallazgos y disposición

| Hallazgo | Evidencia | Acción de la OpenSpec |
|---|---|---|
|8 overrides de icono por variante faltaban |TreatmentIcons.ts:499–518; JSON72 tool glyphs |W10/visual-parity-contract; resolver override antes de tipo |
|12 iconos target mismo gris |ai-tooth-first.json; ConditionSymbol/PatientDiagnosis |colores dentales por rol; Chat/shell conservan identidad |
|Paleta endo violeta frente a pulp layer azul |TREATMENT_COLORS/getPulpConfig |metadata y tokens separados por función |
|Notas y Open IA se obstruyen |rect idéntico, z30/40, hit test devuelve IA |zonas44 y gap8, dock/safe-area; no copiar defecto |
|Compositores hidden/visible duplicados source |pin-notes-draft.json |un Module dueño del draft/feed en target |
|Item completion avanza solo próxima sesión |plan detalle + service.complete_item:1017 |P3 shortcut explícito, no completar todo ni copiar shim legacy |
|Completion + note son dos peticiones source |PlanDetailView.handleCompleteItem |adaptación atómica target bajo un receipt y prueba rollback |
|Quote lock condiciona edición source |plan activo Plan locked |D02 elimina dominio comercial; nombrar adaptación sin inventar quote-lock |
|Fuente tooltip coincide con selector |snapshot dialog Select Surfaces y dialog16 |suspender popover mientras modal owns focus; preservar contexto al salir |

No se eliminaron funciones runtime. architecture-cleanup.md sigue gobernando retirada en Slice10 tras integración; se añaden selectors/icon paths/floating overlap a su inventario de pruebas, no una purga de ConditionSymbol que rompa historial.

## Pruebas ejecutadas ahora

-46/46 frontend: PatientDiagnosis35, PatientOdontogram8, odontogramPresentation3. Son rendered/component tests del código actual. Primer arranque falló por sandbox spawn EPERM; repetición autorizada pasó. No se cambió configuración/dependencias.
-28/28 backend seleccionados,8 deselected, cero skips: test_clinical_workspace_live.py y test_patient_conditions_contract.py, filtro condition/correction/catalog/note/activity. Los fixtures live reemplazan el pool stub por asyncpg contra el Postgres desechable; los contratos HTTP habituales mantienen su boundary de stub. Cubren catálogo→domain→HTTP→SQL, lifecycle/ownership, revisions/receipts/replay, concurrency/rollback, correction/history/paging y notas generales. No son pruebas de75 variantes, planes nuevos ni notas dentales futuras.
-Postgres pgvector16 propio en localhost5439, DB nueva, migraciones hasta head; el runner nunca tomó DATABASE_URL del runtime compartido. Primer intento de migración corrigió cwd a app antes de repetir. El container --rm propio fue detenido en finally; no se creó ni eliminó un named volume. real-proof.json confirma migration/tests/cleanup pass.
-Runtime compartido8000: just dev-ps confirmó app-blue healthy y Postgres healthy; no reconstrucción/restart ni cambios de datos. Salud no establece identidad checkout/image. El comportamiento observado concuerda con el flujo editor presente en código; no se afirma hash de build equivalente.

## Tamaños y evidencia

Native normal441×792 CSS en ambas pestañas. Intento desktop1440×1000 no produjo ese tamaño fuente; target seleccionado reportó1309×909 CSS por zoom. No es comparación desktop válida; override restablecido. Source light/target dark son sus modos actuales: no se cambió tema del usuario ni se afirmó screenshot parity de backgrounds globales. La matriz exacta final figura en visual-parity-contract.md.

Directorio artifacts/diagnosis-parity-live-20261006: pin-palette.json, source-color-icon-registry.json (44 pares fuente,8 overrides), icon-atlas.html (72 glyphs observados, solo evidencia), pin-inspect-16.png, pin-surface-selector.png/pin-surface-selected.png, pin-notes-draft.json/png, pin-floating-overlap.json/png, pin-legend.png, pin-primary.png, pin-plan-detail.png, ai-tooth-first.json/png, real-migration.log, real-tests.log, real-proof.json y run-real-proof.py. No cookies, credenciales ni storage state. Capturas de fichas demo se usan como comparación contextual; las aceptaciones de nuevos writes requieren fixtures sintéticos propios.

## Ocho puntos: cierre honesto

La evidencia actual aumenta preparación de92 a96/100. Cuatro puntos se cierran por inventario visual real/overrides, notas reales en draft, source defects y protecciones existentes probadas de nuevo. Cuatro permanecen como gates de entrega, no dudas de producto:

1. Paridad renderizada del target nuevo con fixtures equivalentes, dark tokens/iconos/capas y estados visuales completos.
2. Matriz exacta de desktop/narrow/zoom/reduced-motion/shell abierto; esta sesión no probó desktop source exacto.
3. Nuevas transacciones75 herramientas/planes/notas dentales: concurrencia, atomicidad de note+execution y retries en Postgres real.
4. Journey persistido nuevo en dos sesiones, migración de consumidores y zero-usage después del cleanup.

No se pueden aprobar comportamientos que todavía no existen. OpenSpec sigue Implementation Ready porque sus decisiones/Interfaces/gates están cerrados; no se declara100/100 ni implementación completa. No nueva entrevista necesaria.
