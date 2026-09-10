## Why

DynaChat no ofrece un flujo clinico para registrar pacientes y documentar evoluciones dentales. Este cambio añade un MVP donde la IA redacta un borrador acotado y el profesional conserva la decision de editarlo y guardarlo.

## Investigation / Current State

- FastAPI registra rutas autenticadas bajo `/api`; `asyncpg` y los repositorios de `app/backend/db/` poseen el acceso a PostgreSQL.
- Alembic administra el esquema y la migracion vigente mas reciente es `0005_gated_dynamous_content`.
- `app/backend/llm/openrouter.py` centraliza el cliente OpenRouter y `CHAT_MODEL`, pero su flujo actual pertenece al Chat, usa streaming, herramientas y RAG.
- React Router concentra las rutas en `app/frontend/src/App.tsx`; `Sidebar`, `api.ts` y el proveedor de toast son los puntos existentes para navegacion, transporte y feedback.

## What Changes

- Añadir un directorio autenticado de pacientes con busqueda por nombre o RUT, creacion, ficha e historial de evoluciones. El listado usa `GET /api/patients`; la busqueda usa `POST /api/patients/search` para que el termino sensible no aparezca en URLs ni query strings.
- Normalizar y validar RUT chileno con Modulo 11, guardar cuerpo y digito verificador por separado y exponer solo una representacion enmascarada.
- Añadir una generacion clinica no streaming que recibe paciente y nota actual; el backend carga como maximo las tres evoluciones aprobadas mas recientes y valida cinco bloques clinicos opcionales mas alertas en JSON estructurado.
- Añadir revision humana, regeneracion no destructiva, alertas no persistidas y guardado idempotente mediante UUID generado por el cliente.
- Guardar el momento clinico como `evolution_at TIMESTAMPTZ`; al abrir el formulario se fija la fecha y hora locales actuales, se muestran como metadato compacto y solo se revelan controles editables al elegir `Cambiar fecha y hora`. El modelo nunca recibe, crea ni modifica ese valor.
- Optimizar el camino repetitivo `abrir paciente -> pegar o escribir nota -> Redactar evolucion -> revisar cinco campos -> guardar` en un solo workspace, sin generar automaticamente al pegar.
- Mantener RUT y datos demograficos dentro del directorio de pacientes y PostgreSQL. La frontera del LLM recibe solo `raw_note` y un historial aprobado acotado, nunca identidad del paciente.
- Definir `generated_text` como la ultima linea base generada correctamente. Si cambia `raw_note`, el borrador queda obsoleto y no puede guardarse hasta regenerar.
- Limitar `raw_note` a 40.000 caracteres como frontera defensiva de backend, sin truncado, resumen ni compresion automatica.
- Aceptar una generacion compuesta solo por alertas cuando el modelo no puede redactar contenido seguro, pero impedir el guardado de un registro clinico vacio.
- Confirmar antes de llamar al proveedor cuando una regeneracion reemplazaria ediciones humanas.
- Abrir `/patients` despues del login y conservar Chat en `/chat` y `/c/:conversationId` sin cambiar RAG, cuotas, streaming o persistencia.
- Añadir un `AppShell` compartido y mantener la interfaz clinica en español.
- Prohibir texto clinico y RUT en logs, y bloquear datos clinicos reales hacia el proveedor externo en produccion hasta aprobar la revision correspondiente.

## Capabilities

### New Capabilities

- `patient-dental-evolutions`: directorio de pacientes por propietario, generacion asistida, revision humana, guardado idempotente e historial dental de solo lectura.

### Modified Capabilities

- Ninguna. `openspec/specs/` no contiene capacidades existentes y los contratos del Chat permanecen sin cambios.

## Change Profile

- Profile: `runtime-change`
- Why this profile fits: añade esquema, persistencia, endpoints autenticados, una llamada LLM y rutas de interfaz visibles.

## Out Of Scope

- Odontograma, citas, tratamientos estructurados y diagnosticos automaticos.
- Edicion de pacientes, edicion o eliminacion de evoluciones y eliminacion fisica de registros clinicos.
- FHIR, RAG clinico, herramientas del Chat y agentes autonomos.
- Campo de instrucciones, conversacion de refinamiento, segunda llamada automatica y sistema de prompts configurable.
- ADR, tabla de auditoria y framework de agentes.

## Impact

- Afecta migraciones Alembic, repositorios `asyncpg`, rutas FastAPI autenticadas y pruebas backend.
- Afecta el cliente API, React Router, el shell, las pantallas de pacientes y sus pruebas.
- Añade una llamada OpenRouter no streaming mediante el cliente y modelo existentes.
- Reutiliza el logging, layout, modal, formularios, toast, tokens y comportamiento responsive existentes; no añade otro framework visual.
- No cambia RAG, herramientas, citas, SSE, cuotas, persistencia de conversaciones, `/c/:conversationId` ni `/admin`.

## Ownership and Test Seam

- Highest existing Seam: endpoints HTTP autenticados y rutas React observables por el usuario.
- Owning Module: rutas y repositorios backend para el contrato clinico; `AppShell` y paginas de pacientes para la experiencia web.
- Interface: recursos JSON bajo `/api`, navegacion protegida y estados visibles en español.
- Highest test Seam: pruebas HTTP con usuario autenticado y pruebas Vitest de rutas e interacciones; el flujo final se comprueba en navegador.
- Adapter: repositorios `asyncpg`, cliente OpenRouter centralizado y funciones de `app/frontend/src/lib/api.ts`.
- Depth / Leverage / Locality: las reglas de propiedad y contexto clinico quedan en backend; el cliente solo envia datos actuales y presenta el resultado validado.

## Prior Art and First Proof

- Prior art: pruebas de autenticacion y aislamiento en `test_auth.py` y `test_conversation_scoping.py`, reglas fijas en `test_system_prompt.py`, runner manual en `scripts/eval_retrieval.py` y pruebas React existentes de sidebar y Chat.
- First failing behavior or contract proof: una solicitud autenticada debe demostrar busqueda por nombre o RUT en un body sanitizado y aislado por propietario, limites de 200 caracteres para busqueda y 40.000 para `raw_note`, rechazo de RUT invalido, salida clinica estructurada sin campos inventados, ventana historica maxima de tres, ausencia de identidad en el proveedor, generacion sin persistencia, confirmacion previa a reemplazar ediciones humanas, rechazo de `final_text` vacio, coherencia de la ultima linea base, logs sanitizados y guardado idempotente antes de añadir codigo de produccion.

## Verification Policy

- Escribir primero pruebas del comportamiento externo en cada slice.
- Probar directamente propiedad, contrato clinico, idempotencia, orden y estados no destructivos.
- Ejecutar comprobaciones enfocadas antes de las suites completas y las regresiones de Chat.
- Validar el cambio con `openspec validate patients-dental-evolutions-mvp`.

## Execution Order Decision

- Required: yes
- Why: los tres slices son verticales, pero generacion depende del paciente y el historial depende del guardado aprobado.

## Notes

- Context: el modelo `Patient -> MedicalRecord` de `health-api` es referencia conceptual; DynaChat conserva FastAPI, Alembic y `asyncpg`.
- Assumptions: `evolution_at` parte en la fecha y hora locales actuales, permanece estable durante generacion y regeneracion y se puede cambiar antes de guardar; el contexto longitudinal usa como maximo los tres `final_text` aprobados mas recientes; una correccion de `raw_note` exige una regeneracion correcta antes de habilitar el guardado.
- Boundaries: la IA redacta; el profesional revisa, edita y guarda mediante una accion explicita.
- Production clinical data gate: `CLINICAL_EXTERNAL_LLM_ENABLED` vale `false` por defecto en produccion y bloquea antes de construir o enviar el payload. Desarrollo y evaluacion lo habilitan de forma explicita solo con datos sinteticos. Produccion no puede habilitarlo para datos reales hasta aprobar privacidad, contrato, logging, retencion, despliegue y tratamiento de datos.
- External references: formato de RUT del SII, reglas de propiedad clinica de Strand y structured outputs de OpenRouter.
