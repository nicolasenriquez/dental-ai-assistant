## Context

DynaChat ya tiene autenticacion por cookie, FastAPI, PostgreSQL con `asyncpg`, Alembic, un cliente OpenRouter centralizado y una aplicacion React. El cambio añade datos clinicos por propietario y un flujo de redaccion asistida sin alterar el Chat. El profesional es responsable del texto final; una generacion no crea un registro clinico.

La referencia `health-api` confirma la relacion conceptual entre paciente y registros medicos, pero su ORM y su modelo amplio no se trasladan. El SII define el RUT como cuerpo numerico separado del digito verificador, calculado con Modulo 11 y `K` mayuscula. Strand aporta la regla conceptual de limitar consultas al usuario y no eliminar registros clinicos. OpenRouter documenta `response_format.type=json_schema` para salidas estructuradas.

## Goals / Non-Goals

**Goals**

- Crear pacientes aislados por propietario y mostrar solo RUT enmascarado.
- Permitir busqueda interna por nombre o RUT sin colocar el termino sensible en URLs, logs ni contexto del modelo.
- Generar cinco bloques clinicos simples desde la nota actual y hasta tres `final_text` aprobados anteriores.
- Reducir el camino habitual a pegar o escribir una nota, redactar, revisar y guardar en una sola pagina.
- Mantener edicion, regeneracion y guardado bajo control explicito del profesional.
- Conservar las tres versiones de la nota y ofrecer historial de solo lectura.
- Integrar el flujo en un shell compartido sin cambiar el comportamiento del Chat.

**Non-Goals**

- Odontograma, citas, tratamientos estructurados, diagnosticos automaticos, FHIR o RAG clinico.
- Edicion de pacientes, edicion o eliminacion de evoluciones.
- Herramientas del Chat, SSE, parser de citas, cuotas del Chat o agentes autonomos.
- Instrucciones libres de refinamiento, segunda llamada automatica o prompts configurables.
- Tabla de auditoria, ADR, framework de agentes o dependencia nueva.

## Boundary and Ownership

### Persistencia clinica

El modulo de repositorio clinico posee todo el SQL y acepta siempre `owner_user_id`. Su Interface usa UUID de usuario, paciente y evolucion. El Seam mas alto es el recurso HTTP autenticado; el Adapter es `asyncpg`. Esta profundidad concentra aislamiento, orden e idempotencia en una frontera reutilizable y mantiene las consultas cerca de su esquema.

### Redaccion clinica

Un servicio de evoluciones posee la construccion del prompt, la carga del historial aprobado, la llamada no streaming y la validacion Pydantic. Su Interface recibe `patient_id` y `raw_note`, y devuelve cinco campos clinicos y `review_flags`. El Adapter es el cliente OpenRouter existente con `CHAT_MODEL`. La aplicacion, no el modelo, posee `evolution_at`.

### Experiencia web

`AppShell` posee navegacion y layout. Las paginas de pacientes poseen la maquina de estados del formulario; `api.ts` adapta HTTP. El Seam observable es la ruta protegida y sus estados textuales. El Chat conserva sus hooks, streaming y almacenamiento actuales.

## Decisions

1. Usar dos tablas nuevas con propiedad explicita y UUID.

   `patients` tendra `id UUID PRIMARY KEY`, `owner_user_id UUID NOT NULL REFERENCES users(id)`, nombres, `rut_number BIGINT`, `rut_dv CHAR(1)`, fecha de nacimiento opcional y timestamps. La unicidad sera `(owner_user_id, rut_number)`. `evolutions` tendra UUID, `patient_id`, `owner_user_id`, `evolution_at TIMESTAMPTZ NOT NULL`, las tres versiones de texto y timestamps. `evolution_at` es el momento clinico; `created_at` y `updated_at` son timestamps tecnicos. Una restriccion unica `(id, owner_user_id)` en pacientes respaldara la FK compuesta de evoluciones `(patient_id, owner_user_id)`.

   Rationale: la propiedad queda validada por consultas y por la base de datos. El RUT no participa en relaciones clinicas.

   Alternatives considered:
   - Relacionar evoluciones solo por `patient_id`. Rechazada porque no impide una asociacion cruzada si una escritura omite la comprobacion de propietario.
   - Usar RUT como clave. Rechazada porque expone un identificador sensible y acopla relaciones clinicas a un dato externo.

2. Normalizar el RUT en backend y devolverlo enmascarado.

   El parser aceptara puntos, guion, espacios y `k` minuscula; quitara separadores, separara cuerpo y DV, convertira `k` a `K` y validara Modulo 11. Formato o DV invalido dara `422`; un cuerpo ya registrado por el mismo propietario dara `409`. Las respuestas no incluiran `rut_number` ni `rut_dv`, solo `rut_masked`.

   Rationale: el backend es la frontera de confianza y garantiza el mismo contrato para cualquier cliente.

   Alternatives considered:
   - Validar solo en React. Rechazada porque otros clientes podrian saltarse la regla.

3. Separar el listado de la busqueda sensible de pacientes.

   `GET /api/patients` devolvera el listado ordinario. `POST /api/patients/search` recibira `{ "query": "..." }` en el body y aplicara `MAX_PATIENT_SEARCH_LENGTH = 200`. Una busqueda que exceda ese limite dara `422`. El backend interpretara una entrada reconocible como RUT, la normalizara y buscara una coincidencia exacta; cualquier otra entrada se tratara como busqueda por nombre. Ambas ramas incluiran `owner_user_id = current_authenticated_user` y devolveran solo la representacion minima con `id`, nombres, `rut_masked` y `last_evolution_at`. No habra `q`, RUT ni `search_type` en la URL.

   La busqueda consulta solo PostgreSQL. Sus resultados, nombres y RUT no alimentan el servicio de generacion. Los logs de acceso, aplicacion, debug y error no registraran el body ni el termino buscado. Un `409` por RUT duplicado del mismo propietario podra incluir la representacion minima del paciente existente para que la UI ofrezca `Abrir paciente`; nunca incluira componentes de RUT sin enmascarar ni buscara fuera del propietario.

   Rationale: el RUT agiliza la identificacion dentro de DynaChat, pero no pertenece a una URL observable ni al contexto clinico del proveedor.

   Alternatives considered:
   - Mantener `GET /api/patients?q=`. Rechazada porque un RUT en la query puede quedar en historial, proxies, analytics y access logs.
   - Exigir `search_type`. Rechazada porque el backend puede distinguir el RUT normalizable de un nombre sin añadir otra decision a la interfaz.

4. Mantener una superficie HTTP pequeña y sin mutaciones posteriores.

   Se añadiran `GET/POST /api/patients`, `POST /api/patients/search`, `GET /api/patients/{patient_id}`, `GET/POST /api/patients/{patient_id}/evolutions`, `GET /api/evolutions/{evolution_id}` y `POST /api/evolutions/generate`. Toda consulta incluira `owner_user_id`; recursos ajenos y ausentes devolveran `404`. No habra `PATCH` ni `DELETE`.

   Rationale: el MVP necesita crear y leer. La ausencia de edicion y eliminacion reduce el riesgo sobre registros clinicos.

5. Cargar el contexto longitudinal en backend desde PostgreSQL.

   Generar aceptara solo `patient_id` y `raw_note`. El modelo Pydantic del request aplicara `MAX_RAW_NOTE_LENGTH = 40_000` y exigira `1 <= len(raw_note.strip()) <= 40_000`. Una nota vacia, compuesta solo por espacios o superior al limite dara `422` antes de consultar historial o proveedor. El backend nunca truncara, resumira ni comprimira la fuente. El servicio verificara propiedad y consultara las tres evoluciones aprobadas mas recientes con una constante backend `CLINICAL_HISTORY_LIMIT = 3`. La consulta seleccionara en orden `evolution_at DESC, created_at DESC` y el servicio invertira esa ventana para enviarla del registro mas antiguo al mas reciente. Para cada antecedente enviara `evolution_at` y `final_text`. Excluira el momento de la evolucion actual, RUT, nombre, fecha de nacimiento, notas rapidas anteriores y borradores anteriores.

   Rationale: el servidor controla procedencia y evita que el navegador fabrique historial. Una consulta ordenada es suficiente; esto no es RAG.

   Alternatives considered:
   - Permitir que el cliente envie historial. Rechazada por manipulacion y fuga de datos.
   - Añadir resumen, embeddings o seleccion semantica. Rechazada porque una ventana fija limita exposicion sin introducir RAG.

6. Usar una sola llamada no streaming con bloques clinicos estructurados.

   El servicio reutilizara el cliente centralizado y `CHAT_MODEL`, pero no `stream_chat`. Enviara `response_format.type=json_schema` con un esquema cerrado para `context`, `findings`, `assessment`, `treatment`, `follow_up` y `review_flags`. Los cinco campos clinicos seran strings obligatorios en el JSON pero podran contener `""`; esto fija la forma sin obligar al modelo a inventar contenido. Pydantic validara los seis campos, incluidos flags con `source_text` y `reason`. Cinco campos vacios con uno o mas flags validos es una respuesta valida; cinco campos vacios sin flags es un error recuperable. La respuesta no contiene fecha ni hora.

   La UI mostrara y permitira editar cada bloque por separado. Para guardar, compondra `generated_text` y `final_text` con etiquetas fijas y omitira las secciones vacias. Una respuesta valida con cinco campos vacios y flags abre una revision util, pero no habilita el guardado. `Guardar evolucion` se habilita apenas el profesional completa al menos un campo clinico con contenido no vacio. El endpoint de guardado exige `final_text.strip() != ""` y devuelve `422` sin crear una fila cuando no se cumple. `generated_text` captura la ultima linea base generada correctamente de la cual parte el estado de revision actual; como llega desde el navegador, no es evidencia de auditoria autoritativa. No se guardan generaciones intermedias. `final_text` es el registro clinico aprobado por el profesional.

   Rationale: una respuesta atomica y separada por funcion clinica facilita revision y pruebas sin convertir el flujo en un formulario diagnostico obligatorio.

7. Tratar las notas clinicas como datos no confiables.

   El prompt de sistema delimitara `PREVIOUS_EVOLUTIONS` y `CURRENT_RAW_NOTE`; ninguna instruccion dentro de esos bloques podra cambiar las reglas. El pipeline leera historial, extraera hechos actuales, resolvera solo referencias explicitas, conservara negaciones, atribuciones e incertidumbre, separara fragmentos ambiguos en flags, ubicara cada hecho en el bloque clinico correspondiente y verificara procedencia antes de emitir solo JSON. Un bloque sin evidencia quedara vacio. El prompt no recibe el momento clinico actual porque ese dato pertenece a la aplicacion y no cambia la tarea de redaccion.

   El prompt prohibira diagnosticar, recomendar tratamientos, inventar datos, inferir evolucion temporal, elevar incertidumbre a certeza, cambiar atribuciones, repetir antecedentes no activados, resolver ambiguedad por suposicion y añadir explicaciones o relleno.

   Rationale: el principal riesgo del borrador es convertir contexto historico o texto hostil en afirmaciones clinicas actuales.

8. Hacer regeneracion y guardado no destructivos.

   La UI usara `editing_raw -> generating -> reviewing -> saving -> saved` dentro de `/patients/:patientId/evolutions/new`. Al abrir la ruta, capturara la fecha y hora locales actuales una sola vez como `evolution_at`, enfocara el textarea y mostrara el valor como `03 sep 2026 · 15:57` junto a `Cambiar fecha y hora`. Solo esa accion revelara los controles nativos de fecha y hora, sin dependencia nueva. El valor elegido permanecera estable durante generacion y regeneracion. `Ctrl/Cmd + Enter` ofrecera un atajo para `Redactar evolucion`; pegar texto nunca llamara al proveedor automaticamente.

   Durante `generating`, la nota permanecera visible y la UI bloqueara su edicion hasta terminar la llamada para evitar que el resultado se desacople de la fuente enviada. Un resultado correcto llenara los cinco bloques en el mismo workspace; no se navega a otra pagina y el profesional no completa esos campos antes de generar. En `reviewing`, la nota original seguira disponible como contenido secundario. Los bloques seran el area principal y los flags apareceran juntos en una region `Informacion por revisar` inmediatamente despues del contenido clinico estructurado.

   `Corregir nota y regenerar` sera la unica accion para volver a editar la fuente. La UI conservara el borrador visible actual, pero cualquier cambio en `raw_note` lo marcara como obsoleto mediante estado local, por ejemplo `isDraftStale`, y deshabilitara `Guardar evolucion`. Al solicitar una regeneracion, la UI comprobara antes de la llamada si el profesional modifico los campos clinicos respecto de `generated_text`. Si no hay ediciones humanas, llamara al proveedor. Si las hay, abrira el modal existente con `Cancelar` y `Regenerar`; el request no comenzara hasta que el profesional confirme. Cancelar no llama al proveedor ni modifica estado o contenido. Confirmar inicia exactamente una llamada. Una regeneracion correcta reemplazara la linea base `generated_text`, llenara los cinco campos, limpiara el estado obsoleto y volvera a habilitar la revision y el guardado cuando exista contenido clinico. Si la regeneracion falla, conservara la nota corregida, la linea base anterior y las ediciones, mantendra el guardado deshabilitado y ofrecera reintento. No se añade una libreria de estados.

   `Cambiar fecha y hora` permanecera disponible en `reviewing` hasta guardar. Cambiar `evolution_at` no marca el borrador como obsoleto ni exige regenerar porque el timestamp no forma parte del request ni del prompt del modelo.

   Guardar recibira un UUID creado una vez con `crypto.randomUUID()`, `evolution_at` como ISO 8601 con offset, nota, texto generado y texto final. El mismo UUID y contenido devolvera el registro existente; contenido distinto dara `409`. Los flags no se guardaran.

   Rationale: los reintentos de red no deben duplicar ni sobrescribir trabajo clinico. El momento clinico guardado siempre procede del workspace, nunca del modelo. El valor por defecto evita una interaccion en el caso habitual y el enlace `Cambiar fecha y hora` conserva la carga historica como caso secundario.

9. Extraer `AppShell` y separar navegacion clinica de conversaciones.

   El sidebar mostrara `Pacientes` y `Chat`, en ese orden. La lista de conversaciones aparecera solo en rutas de Chat. `/` redirigira a `/patients`; `/chat` iniciara o mostrara Chat y `/c/:conversationId` y `/admin` seguiran vigentes. Se añadiran las cuatro rutas de pacientes del contrato.

   La lista de pacientes no sera un dashboard. El historial mostrara fecha y hora de `evolution_at`, mas un preview derivado del inicio de `final_text`. Generacion y guardado anunciaran texto mediante `aria-live`; se reutilizaran modal, toast, tokens, focus rings y comportamiento responsive.

   Rationale: el shell compartido evita duplicar estructura sin mezclar el estado de conversaciones con pacientes.

## API and Data Contracts

### Patient search request and response

```http
POST /api/patients/search
Content-Type: application/json
```

```json
{
  "query": "12.345.678-5"
}
```

Each result contains only `id`, `first_name`, `last_name`, `rut_masked`, and nullable `last_evolution_at`. The backend owns name-versus-RUT interpretation and always scopes the lookup to the authenticated owner. The request term never appears in a URL, query string, response, or log.

### Generate request and response

```json
{
  "patient_id": "uuid",
  "raw_note": "ruidos articulares izq..."
}
```

```json
{
  "context": "Paciente refiere...",
  "findings": "",
  "assessment": "Sospecha de quistes subcondrales referida en informe previo.",
  "treatment": "",
  "follow_up": "",
  "review_flags": [
    {"source_text": "ROM leve", "reason": "Expresion clinica ambigua"}
  ]
}
```

Todos los campos clinicos aceptan un string vacio. El esquema no usa contenido obligatorio como sustituto de evidencia. Si los cinco campos estan vacios y existe al menos un `review_flag` valido, la respuesta es valida y evita fabricar texto. Si los cinco estan vacios y `review_flags` tambien esta vacio, el backend devuelve un error recuperable. La UI presenta las etiquetas `Motivo / contexto`, `Hallazgos`, `Diagnostico / impresion clinica`, `Tratamiento / conducta` y `Seguimiento`, y omite bloques vacios al componer los textos guardados.

`raw_note` debe cumplir `1 <= len(raw_note.strip()) <= 40_000`. No se trunca. El formulario no muestra un contador permanente salvo que el patron existente de DynaChat lo exija. Desde 35.000 caracteres muestra el conteo contextual. Si una entrada pegada supera 40.000, conserva el texto para que el profesional pueda corregirlo, muestra `La nota supera el limite de 40.000 caracteres. Reduce el contenido antes de continuar.` y deshabilita `Redactar evolucion`.

### Save request

```json
{
  "id": "client-generated-uuid",
  "evolution_at": "2026-09-03T15:57:24-04:00",
  "raw_note": "...",
  "generated_text": "...",
  "final_text": "..."
}
```

Semantica de procedencia:

- `raw_note`: fuente actual escrita por el profesional y usada para producir la linea base vigente.
- `generated_text`: ultima linea base generada correctamente de la cual parte la revision actual. Una regeneracion correcta reemplaza la anterior; las generaciones intermedias no se persisten. Sirve para procedencia de producto, pero no es evidencia de auditoria autoritativa porque el navegador lo envia al guardar.
- `final_text`: registro clinico revisado y aprobado por el profesional.

Una futura exigencia de procedencia fuerte requerira otra capability con captura server-side. Este MVP no simula esa garantia.

El endpoint de guardado aplica el mismo limite de `raw_note` y rechaza con `422` cualquier `final_text` vacio o compuesto solo por espacios. La UI aplica ambas reglas antes de enviar, pero el backend es la autoridad.

### Model input

```text
PREVIOUS_EVOLUTIONS
[evolution_at]
[final_text aprobado]

CURRENT_RAW_NOTE
[nota escrita por el profesional]
```

El prompt no incluye el `evolution_at` actual. El navegador conserva ese valor para el guardado y el modelo no puede alterarlo.

## Visual contract

### Repository mapping

Los wireframes componen patrones que ya existen. No crean otro sistema visual.

| Need | Existing DynaChat authority | Planned use |
|---|---|---|
| Application frame | `App.tsx` `.app-layout`, `.main-area` and mobile overlay | Extract `AppShell`; preserve the mobile drawer and add a compact desktop rail |
| Navigation | `Sidebar.tsx` full-width primary action, links, focus rings and footer | Add `Pacientes` and `Chat`; show conversations only in Chat |
| Page container and rows | `AdminVideos.tsx` `max-w-6xl`, header, search, bordered surface, loading and empty states | Use a readable patient list and timeline rows, not dashboard cards |
| Forms and fields | `Login.tsx` labels, inputs, validation text and submit state | Reuse field spacing, borders, radius, focus and disabled styles |
| Dialog | `AddVideoModal.tsx` overlay, centered surface, `role=dialog`, `aria-modal` and actions | Create patient and replace-edits confirmation |
| Feedback | `ToastProvider.tsx` success/error toasts and `aria-live` | Save confirmation and recoverable errors |
| Tokens | `globals.css` background, surfaces, border, accent, text, success, danger and warning | Use existing variables only |

Desktop reference for all six screens: 1440 x 900. Desktop navigation can collapse from 240 px to a 56 px rail. At widths below 768 px, it remains a 260 px drawer with overlay and hamburger. Page headers wrap, actions remain near their owning content, rows stack their metadata, and form sections become one column.

### 01. Patient list

```text
┌──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────┐
│ DynaChat             │ Pacientes                                                   [+ Nuevo paciente]          │
│                      │ Gestiona pacientes y sus evoluciones dentales.                                         │
│ ● Pacientes          │                                                                                         │
│ ○ Chat               │ ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│                      │ │ Buscar por nombre o RUT...                                                          │ │
│                      │ └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                      │                                                                                         │
│                      │ PACIENTES                                                                               │
│                      │ ┌─────────────────────────────────────────────────────────────────────────────────────┐ │
│                      │ │ Juan Perez                   12.***.***-*       Ultima evolucion: 03 sep · 15:57  › │ │
│                      │ ├─────────────────────────────────────────────────────────────────────────────────────┤ │
│                      │ │ Maria Soto                   18.***.***-*       Sin evoluciones                    › │ │
│                      │ └─────────────────────────────────────────────────────────────────────────────────────┘ │
│                      │                                                                                         │
│                      │ Loading: filas skeleton dentro de la superficie                                        │
│                      │ Empty list: "Aun no hay pacientes" + [+ Nuevo paciente]                               │
│                      │ Empty search: "No encontramos pacientes"                                              │
│                      │ Error: alerta inline "No pudimos buscar pacientes" [Reintentar]                        │
│ Admin / Biblioteca   │                                                                                         │
└──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────┘
```

Primary CTA: `+ Nuevo paciente`. Secondary action: open a patient row. Search stays above the single list surface and remains one field; the UI does not expose the `POST /api/patients/search` transport or ask the user to choose between name and RUT.

### 02. Create patient dialog

```text
┌──────────────────────────────────────── page dimmed by existing modal overlay ──────────────────────────────────┐
│                                                                                                                  │
│                    ┌──────────────────────────────────────────────────────────────────┐                          │
│                    │ Nuevo paciente                                             [×] │                          │
│                    │ Crea la ficha basica. Podras agregar una evolucion despues.     │                          │
│                    │                                                                  │                          │
│                    │ Nombre                         Apellido                           │                          │
│                    │ [________________________]     [________________________]         │                          │
│                    │                                                                  │                          │
│                    │ RUT                            Fecha de nacimiento                │                          │
│                    │ [12.345.678-5___________]      [dd/mm/aaaa______________]         │                          │
│                    │ Formato o DV invalido                                               │                          │
│                    │                                                                  │                          │
│                    │                              [Cancelar] [Crear paciente]          │                          │
│                    │ Saving:                                 [Creando...]             │                          │
│                    │ Error: mensaje inline; campos y foco se conservan                │                          │
│                    └──────────────────────────────────────────────────────────────────┘                          │
│                                                                                                                  │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The dialog follows `AddVideoModal`: labelled modal, backdrop dismissal rules, keyboard focus, inline error and adjacent actions. It reuses native inputs.

If creation returns the same owner's duplicate-RUT `409`, the dialog replaces the dead-end error with `Este paciente ya existe`, the existing patient's name and masked RUT, plus `Cancelar` and `Abrir paciente`. The response and dialog never expose raw RUT and never search another owner's records.

### 03. Patient detail and timeline

```text
┌──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────┐
│ DynaChat             │ ‹ Pacientes                                                                              │
│                      │ Juan Perez                                                [+ Nueva evolucion]            │
│ ● Pacientes          │ RUT 12.***.***-* · Nacimiento 14 may 1985                                                │
│ ○ Chat               │                                                                                         │
│                      │ HISTORIAL DE EVOLUCIONES                                                                  │
│                      │                                                                                         │
│                      │ ● 03 sep 2026 · 15:57                                                                     │
│                      │ │ Motivo / contexto: Paciente refiere ruido articular izquierdo...                     › │
│                      │ │                                                                                         │
│                      │ ● 28 ago 2026 · 10:20                                                                     │
│                      │   Hallazgos: Sensibilidad localizada...                                                › │
│                      │                                                                                         │
│                      │ Loading: timeline skeleton                                                               │
│                      │ Empty: "Este paciente aun no tiene evoluciones" [+ Nueva evolucion]                    │
│                      │ Error: alerta inline [Reintentar]                                                        │
│ Admin / Biblioteca   │                                                                                         │
└──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────┘
```

Primary CTA: `+ Nueva evolucion`. Timeline rows render the clinical date and time from `evolution_at` in the intended local timezone, not as raw UTC, plus a preview from `final_text` and a chevron; there are no edit or delete actions. The MVP reuses existing DynaChat or browser timezone behavior and adds no timezone subsystem.

### 04. New evolution

Route: `/patients/:patientId/evolutions/new`. State: `editing_raw`. This and wireframe 05 are states of the same page, not separate routes or navigation steps.

```text
┌──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────┐
│ DynaChat             │ ‹ Juan Perez                                                                                  │
│                      │                                                                                                │
│ ● Pacientes          │ Nueva evolucion dental                                                                         │
│ ○ Chat               │ 03 sep 2026 · 15:57                                                  Cambiar fecha y hora     │
│                      │                                                                                                │
│                      │ Pega o escribe tus notas clinicas tal como las registras normalmente.                          │
│                      │ La IA las ordenara para que las revises antes de guardar.                                      │
│                      │                                                                                                │
│                      │ NOTA RAPIDA                                                                                    │
│                      │ ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│                      │ │ ruidos articulares lado izquierdo, artralgia, sospecha quistes subcondrales,            │   │
│                      │ │ otorrino descarta inflamacion e infeccion, ROM leve, 3.6 lesion cercana...              │   │
│                      │ │                                                                                          │   │
│                      │ │                                                                                          │   │
│                      │ └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                      │                                                                                                │
│                      │                                                         [Redactar evolucion]                   │
│                      │                                                          Ctrl/Cmd + Enter                      │
│                      │                                                                                                │
│                      │ Generating: "Redactando evolucion...". La nota sigue visible y se bloquea hasta terminar.     │
│                      │ Error: alerta inline + [Reintentar]; momento clinico y nota se conservan                       │
│ Admin / Biblioteca   │                                                                                                │
└──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Primary CTA: `Redactar evolucion`. The textarea receives autofocus. Pasting never triggers generation. Normal notes show no permanent counter. At 35,000 characters the UI reveals the current count against 40,000; over-limit pasted text remains intact, shows the validation message, and disables generation. Selecting `Cambiar fecha y hora` progressively reveals native date and time inputs styled like the existing forms; no date-picker package is added. An icon may accompany the CTA only if the existing DynaChat icon language has an equivalent.

### 05. Review evolution

Route: `/patients/:patientId/evolutions/new`. State: `reviewing`. Generation populates this state in place.

```text
┌──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────┐
│ DynaChat             │ ‹ Juan Perez                                                                                  │
│                      │                                                                                                │
│ ● Pacientes          │ Nueva evolucion dental                                                                         │
│ ○ Chat               │ 03 sep 2026 · 15:57                                                  Cambiar fecha y hora     │
│                      │                                                                                                │
│                      │ NOTA ORIGINAL                                                                              │
│                      │ ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│                      │ │ ruidos articulares lado izquierdo, artralgia, sospecha quistes subcondrales...          │   │
│                      │ └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                      │ [Corregir nota y regenerar]                                                                   │
│                      │                                                                                                │
│                      │ EVOLUCION REDACTADA                                                                            │
│                      │ Motivo / contexto                                                                               │
│                      │ ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│                      │ │ Paciente refiere...                                                                         │   │
│                      │ └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                      │ Hallazgos                                                                                       │
│                      │ ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│                      │ │ ...                                                                                      │   │
│                      │ └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                      │ Diagnostico / impresion clinica                                                               │
│                      │ ┌──────────────────────────────────────────────────────────────────────────────────────────┐   │
│                      │ │ Se mantiene sospecha de quistes subcondrales...                                         │   │
│                      │ └──────────────────────────────────────────────────────────────────────────────────────────┘   │
│                      │ Tratamiento / conducta                       Seguimiento                                      │
│                      │ ┌─────────────────────────────────────────┐  ┌────────────────────────────────────────────┐  │
│                      │ │                                         │  │                                            │  │
│                      │ └─────────────────────────────────────────┘  └────────────────────────────────────────────┘  │
│                      │ ─────────────────────────────────────────────────────────────────────────────────────────── │
│                      │ Informacion por revisar                                                                      │
│                      │ "ROM leve" · Expresion clinica ambigua                                                       │
│                      │                                                                    [Guardar evolucion]       │
│ Admin / Biblioteca   │                                                                                                │
└──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────┘
```

Primary CTA: `Guardar evolucion`. `Corregir nota y regenerar` is the only secondary source-editing action. The note is available but visually secondary; the generated fields are the working area. Flags appear in one `Informacion por revisar` region after all structured clinical content because the schema does not classify a flag by field. When all five fields are empty, the UI shows `No hay contenido clinico para guardar. Corrige la nota y vuelve a redactar, o completa manualmente al menos un campo.` and disables save; typing meaningful content into any field enables it. After the source changes, save stays unavailable until regeneration succeeds. `Cambiar fecha y hora` remains available and does not stale the draft. A regeneration that would replace human edits opens the existing dialog before any provider call. Cancel performs no call or replacement; confirm starts one call. Saving announces `Guardando evolucion...`; on error every field and edit remains unchanged.

Replacement confirmation reuses the existing DynaChat dialog:

```text
┌──────────────────────────────────────────────────────┐
│ Regenerar evolucion                              [×] │
│                                                      │
│ Realizaste cambios en la evolucion redactada.        │
│ Al regenerar, esos cambios seran reemplazados por    │
│ un nuevo borrador generado desde la nota corregida.  │
│                                                      │
│                              [Cancelar] [Regenerar]  │
└──────────────────────────────────────────────────────┘
```

The empty-clinical-content variant keeps the same review workspace, fields, original note, flags, and date controls. It replaces the active save action with the inline explanation above and a disabled `Guardar evolucion`; it does not introduce another route or modal.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ EVOLUCION REDACTADA                                                         │
│ Motivo / contexto      [                                                  ] │
│ Hallazgos              [                                                  ] │
│ Diagnostico / impresion[                                                  ] │
│ Tratamiento / conducta [                    ] Seguimiento [                ] │
│ ─────────────────────────────────────────────────────────────────────────── │
│ Informacion por revisar                                                     │
│ "ROM leve" · Expresion clinica ambigua                                     │
│                                                                              │
│ No hay contenido clinico para guardar.                                      │
│ Corrige la nota y vuelve a redactar, o completa manualmente al menos un campo.│
│                                                   [Guardar evolucion] disabled│
└──────────────────────────────────────────────────────────────────────────────┘
```

### 06. Evolution detail

```text
┌──────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────┐
│ DynaChat             │ ‹ Juan Perez                                                                             │
│                      │ Evolucion dental · 03 sep 2026 · 15:57                                                    │
│ ● Pacientes          │ Registro aprobado                                                                         │
│ ○ Chat               │                                                                                         │
│                      │ MOTIVO / CONTEXTO                                                                         │
│                      │ Paciente refiere ruido articular izquierdo...                                            │
│                      │                                                                                         │
│                      │ DIAGNOSTICO / IMPRESION CLINICA                                                           │
│                      │ Sospecha de quistes subcondrales...                                                       │
│                      │                                                                                         │
│                      │ Secciones vacias omitidas · sin editar · sin eliminar                                    │
│                      │                                                                                         │
│                      │ Loading: bloques skeleton                                                                 │
│                      │ Error: alerta inline "No pudimos cargar la evolucion" [Volver] [Reintentar]              │
│ Admin / Biblioteca   │                                                                                         │
└──────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────┘
```

The page has no primary mutation. `Volver a Juan Perez` is the only normal action.

## Production clinical data gate

Development, automated tests and manual evaluation MUST use synthetic data. Real patient clinical data MUST NOT be sent to OpenRouter or another external LLM in production until privacy, contractual, logging, retention, deployment and data-processing requirements have been reviewed and explicitly approved for production use. This gate does not block MVP development; it blocks only external processing of real clinical data in production.

The clinical service owns deterministic enforcement through `CLINICAL_EXTERNAL_LLM_ENABLED`. Production defaults it to `false`. When false, generation returns a safe unavailable response before assembling or sending the provider request. Development, tests and the manual runner may enable it explicitly for synthetic fixtures. Production may set it to `true` only after the stated review is approved. The software does not inspect or classify note text as real or synthetic.

## Fast-path UX principles

The interaction follows the shortest repeatable path: open patient, paste or type, redact, review, save. These principles guide trade-offs; they are not a checklist that overrides repository conventions.

- Keep one primary decision per state: `Redactar evolucion` in `editing_raw`, then `Guardar evolucion` in `reviewing`.
- Put actions beside the content they affect and keep the textarea large enough for pasted notes.
- Place patient and clinical time first, save last, and return to the timeline with `Evolucion guardada`.
- Preserve unfinished work through provider, validation, regeneration and save errors.
- Use five clearly connected clinical blocks and keep provider, schema and history mechanics out of the interface.
- Prefer current local date and time without interaction; reveal correction controls only on request.
- Accept ordinary pasted note and RUT formatting while retaining validation, ownership and explicit-save guards.
- When principles conflict, prioritize clarity, accessibility, user control and successful task completion, in that order, before decoration.

## Clinical logging policy

The implementation MUST reuse the existing Python logging system and MUST NOT log raw RUT, `rut_number`, `rut_dv`, patient search terms, `raw_note`, `generated_text`, `final_text`, previous evolutions, or complete OpenRouter request and response bodies. The rule applies to info, warning, error and debug logs, including search, Pydantic and provider exceptions. `POST /api/patients/search` does not receive a payload-logging exception.

Logs MAY contain `request_id`, internal `user_id`, `patient_id`, `evolution_id`, operation, status, duration, provider/model identifiers, token or cost metadata already supported, and a sanitized error category. HTTP access logs must not include RUT or clinical text in paths or query strings.

## Risks / Trade-offs

- [El historial puede crecer] -> limitar la consulta a las tres evoluciones aprobadas mas recientes y enviar esa ventana del registro mas antiguo al mas reciente.
- [Prompt injection dentro de notas] -> separar datos del sistema, prohibir que los bloques dicten instrucciones y cubrir entradas hostiles con pruebas.
- [El modelo devuelve JSON invalido] -> usar schema estricto, validar con Pydantic y devolver un error recuperable sin tocar estado ni cuota del Chat.
- [Acceso cruzado] -> filtrar cada consulta por propietario, devolver `404` y respaldar escrituras con FK compuesta.
- [Un RUT buscado queda en infraestructura observable] -> enviar busquedas en el body de `POST /api/patients/search`, omitir payloads de logs y devolver solo resultados enmascarados del propietario.
- [Reintento duplica una evolucion] -> UUID de cliente e idempotencia por identidad y contenido.
- [La fuente cambia despues de generar] -> marcar la linea base como obsoleta, bloquear guardado y exigir una regeneracion correcta sin descartar trabajo.
- [Texto clinico aparece en logs o excepciones] -> registrar solo identificadores internos, metadata operativa y categorias sanitizadas; probar todos los niveles de logging.
- [Datos reales llegan al proveedor antes de aprobar produccion] -> gate fail-closed en el servicio clinico; desarrollo y evaluacion usan solo datos sinteticos.
- [`generated_text` parece una auditoria fuerte] -> nombrarlo como captura de procedencia de producto y documentar que el navegador puede modificarlo.
- [Una migracion nueva no es reversible sin perdida] -> `downgrade` elimina solo las dos tablas nuevas; no ejecutarlo en produccion si contienen registros que deban conservarse.

## Migration Plan

1. Aplicar `0006_add_patients_and_evolutions` antes de servir endpoints nuevos.
2. Desplegar backend y frontend compatibles en la misma version; las tablas empiezan vacias y no requieren backfill.
3. Verificar creacion y lectura con dos propietarios antes de habilitar uso clinico.
4. Mantener bloqueada la generacion externa con datos clinicos reales hasta registrar aprobacion del production clinical data gate.
5. Ante fallo previo a datos reales, revertir la aplicacion y ejecutar el downgrade. Con datos reales, conservar tablas y revertir solo la aplicacion hasta corregir.

## Verification Strategy

- Probar los endpoints autenticados con dos usuarios y afirmar `404` para recursos ajenos, `422` para RUT invalido o busqueda superior a 200 caracteres y `409` recuperable para duplicados. Probar busqueda por nombre y por RUT mediante body, sin query string y sin resultados de otro propietario.
- Probar el prompt como texto fijo y la llamada OpenRouter en el Adapter simulado. Verificar los limites inclusivos de `raw_note`, rechazo sin truncado, una ventana maxima de tres `final_text` aprobados, orden interno, ausencia de RUT y datos demograficos, cinco campos clinicos opcionales, el caso valido de cinco campos vacios con flags, el error de cinco campos vacios sin flags, ausencia de persistencia o cuota, y tratamiento vacio cuando no existe evidencia.
- Capturar logs en busquedas y fallos HTTP, OpenRouter y Pydantic; afirmar que ningun termino RUT ni texto clinico aparece incluso con nivel debug.
- Probar que el production clinical data gate permite datos sinteticos en desarrollo y falla antes de llamar al proveedor con datos reales en produccion sin aprobacion.
- Probar la maquina de estados React, contador visible solo desde 35.000 caracteres, borrador obsoleto tras cambiar `raw_note`, fecha editable sin invalidarlo, revision solo con flags y guardado bloqueado hasta agregar contenido, rechazo backend de `final_text` vacio, ultima linea base correcta, confirmacion antes de llamar al proveedor cuando se reemplazan ediciones, cero llamadas al cancelar, una llamada al confirmar, conservacion tras error, region centralizada de flags, recuperacion del duplicado, `aria-live`, navegacion y toast posterior al guardado.
- Ejecutar los casos clinicos sinteticos automatizados y el runner manual sin datos reales.
- Ejecutar Ruff, formato, mypy, pytest, TypeScript, Biome, Vitest y regresiones del Chat; comprobar las seis pantallas contra los wireframes a 1440x900, un ancho responsive y teclado.

## Slice Dependencies

El directorio de pacientes establece identidad, propiedad, rutas y shell. La generacion estructurada depende de ese paciente y de su repositorio. El guardado e historial dependen del borrador revisable. No hay trabajo paralelo seguro que elimine esas dependencias de contrato.

## Requirement-to-proof matrix

Esta matriz es el control de CR-08. Cada fila une un requisito con escenarios observables, una tarea fail-first, implementacion y la prueba esperada.

| Requirement | Critical scenarios | Tasks | Automated or observable proof |
|---|---|---|---|
| Authenticated patient directory | List, body-based name/RUT search, 200-character search limit, owner isolation, create, cross-owner `404` | `1.1`, `2.1`, `3.1` | Authenticated HTTP tests with two users, request-limit and URL assertions, and patient-page tests |
| Chilean RUT normalization and privacy | Accepted separators, invalid DV, duplicate scope and recovery, masked response, no search-term logging | `1.1`, `1.3`, `2.1`, `3.1`, `3.3` | RUT unit cases, captured-log assertions and duplicate-dialog test |
| Owner-bound evolution persistence | Owned save, non-empty approved record, bounded raw note, latest successful AI baseline, distinct clinical and technical timestamps, composite association, foreign read, no update/delete | `1.3`, `2.1`, `2.3`, `3.3` | Migration and repository constraint tests plus authenticated route, validation, and provenance tests |
| Idempotent explicit save | First save, identical retry, conflicting retry, generate never saves | `1.3`, `2.3`, `3.3` | Database row counts and `409` route proof |
| Ordered approved history | Descending list and read-only detail | `1.3`, `2.3`, `3.3` | Deterministic timestamp fixtures and frontend rendering tests |
| Server-owned generation inputs | Body contains only patient and raw note; 1-to-40,000-character boundary without truncation; search disconnected; three-record cap; oldest-to-newest prompt order; current time, RUT and demographics excluded; no RAG; foreign `404` | `1.2`, `2.2`, `3.2` | Request-boundary cases, repository spy, provider-boundary forbidden-value assertions, and dependency inspection |
| Guarded clinical drafting | Inactive history, explicit reference, preserved suspicion, literal ambiguity, hostile instruction, empty treatment | `1.2`, `2.2`, `3.2` | Fixed-prompt tests and synthetic clinical cases |
| Structured recoverable generation | Five optional strings, all-empty with flags accepted for review but not save, manual completion enables save, all-empty without flags rejected, centralized flags, invalid schema, UI composition, Chat isolation | `1.2`, `2.2`, `3.2` | Mocked OpenRouter contract tests, Pydantic cases, and Vitest editor and save-state tests |
| Human review and non-destructive regeneration | Local datetime default and review-time edit without stale state, progressive controls, autofocus, explicit generation, same-route review, stale source blocks save, pre-provider replacement confirmation, zero calls on cancel, one call on confirm, successful regeneration updates baseline, failure preservation, explicit save | `1.2`, `2.2`, `3.2`, `1.3`, `2.3`, `3.3` | State-machine, keyboard, paste, dialog/provider-spy, stale-marker, provenance, and save-payload assertions |
| Patient-first application shell | Root redirect, navigation order, conversation visibility, Chat regression | `1.1`, `2.1`, `3.1`, `4.1` | Router/sidebar tests and existing Chat suites |
| Spanish accessible patient experience | List, one primary CTA per evolution state, near-limit-only character feedback, empty-clinical explanation, toast, busy state, six wireframes, keyboard and responsive behavior | `1.1`, `1.2`, `1.3`, `2.1`, `2.2`, `2.3`, `3.2`, `3.3`, `4.1` | Vitest interaction tests and browser checks at reference and narrow viewports |
| Synthetic clinical evaluation | Automated cases and manual non-CI runner | `1.2`, `2.2`, `3.2` | Backend eval tests and manual runner output with synthetic fixtures |
| Production clinical data gate | Explicit synthetic enablement, production default false, unapproved production blocked before provider call, no content classification | `1.2`, `2.2`, `3.2`, `4.1` | Environment-boundary tests with provider mock asserted not called |
| Clinical data logging prohibition | Search, provider, validation and HTTP failures contain no RUT, search term or clinical payload | `1.1`, `1.2`, `2.1`, `2.2`, `3.1`, `3.2`, `4.1` | Captured logs at debug through error with forbidden-value assertions |

## Open Questions

Ninguna. El alcance, los contratos y los supuestos de v0.1 estan cerrados.

## References

- SII, formato de RUT, cuerpo numerico, DV, Modulo 11 y `K` mayuscula: https://www.sii.cl/ccp/formato_envio_cp_electronico.pdf
- OpenRouter, structured outputs con `response_format.type=json_schema`: https://openrouter.ai/docs/guides/features/structured-outputs
- `health-api`, relacion conceptual `Patient -> MedicalRecord`: https://raw.githubusercontent.com/AlwaysSany/health-api/main/app/models/patient.py
- Strand, referencia conceptual de propiedad y conservacion de registros clinicos: https://github.com/potalora/strand/blob/main/docs/backend-handoff.md
