# Baseline QA por vista

## Application Overview

Dental AI Assistant permite administrar pacientes y evoluciones dentales,
redactar evoluciones con asistencia de IA, consultar el chat RAG y administrar
la biblioteca de videos. Este plan cubre las vistas navegables y sus estados
interactivos con datos deterministas en la frontera HTTP.

## Test Scenarios

### 1. Vistas públicas

**Seed:** `tests/qa-baseline.spec.ts` con APIs de autenticación mockeadas.

#### 1.1. public-auth-and-not-found-views

**File:** `tests/qa-baseline.spec.ts`

**Steps:**

1. Abrir `/login`.
   - expect: Los campos de correo, contraseña y el botón de inicio son visibles y accesibles.
   - expect: La vista tiene snapshot ARIA y screenshot estable.
2. Enviar credenciales inválidas y después válidas.
   - expect: Se muestra el error de credenciales inválidas.
   - expect: El acceso válido navega a `/patients`.
3. Abrir `/signup` y enviar una contraseña corta.
   - expect: Se muestra la validación de mínimo de ocho caracteres.
4. Abrir una ruta inexistente.
   - expect: Se muestra `Página no encontrada` y el enlace de retorno.

### 2. Pacientes y evoluciones

#### 2.1. patients-and-evolution-views

**File:** `tests/qa-baseline.spec.ts`

**Steps:**

1. Abrir `/patients` y buscar un paciente inexistente.
   - expect: El estado vacío y `Limpiar búsqueda` son visibles.
2. Abrir `Nuevo paciente` con datos inválidos y cancelar con cambios.
   - expect: La fecha inválida se marca con `aria-invalid`.
   - expect: El diálogo de salida ofrece continuar o salir sin guardar.
3. Abrir el detalle y editar el paciente.
   - expect: El historial y el detalle de evolución son visibles.
   - expect: El diálogo de edición mantiene nombre accesible y foco.
4. Abrir una nueva evolución.
   - expect: El botón de generación inicia deshabilitado.
   - expect: Fecha/hora se pueden expandir y los campos tienen labels.
   - expect: La generación muestra un borrador revisable.
5. Editar el borrador y solicitar regeneración.
   - expect: El diálogo de regeneración se puede cancelar.
   - expect: El diálogo de confirmación de guardado se puede volver a revisar.

### 3. Chat y biblioteca

#### 3.1. chat-library-and-mobile-navigation

**File:** `tests/qa-baseline.spec.ts`

**Steps:**

1. Abrir `/chat` y seleccionar un starter.
   - expect: El texto se inserta en el compositor.
2. Abrir una conversación y enviar una pregunta.
   - expect: Se hidrata el historial y aparece la respuesta SSE mockeada.
3. Abrir el menú de conversación y elegir eliminar.
   - expect: El diálogo destructivo se puede cancelar.
4. Abrir la biblioteca y el diálogo de agregar video.
   - expect: Ambos diálogos tienen controles accesibles y cierre explícito.
5. Cambiar a `390x844` y abrir/cerrar navegación.
   - expect: No existe overflow horizontal.

### 4. Asistente clínico y Drive

#### 4.1. clinical-assistant-and-drive

**File:** `tests/qa-baseline.spec.ts`

**Steps:**

1. Abrir `/a/:threadId`.
   - expect: El compositor, paciente activo y estado vacío son visibles.
2. Abrir Google Drive en escritorio y móvil.
   - expect: Se muestra la superficie de escritorio o el sheet móvil sin overflow.
3. Enviar una nota clínica.
   - expect: Aparece el borrador y la acción `Revisar y guardar`.
4. Abrir la confirmación de guardado y volver a editar.
   - expect: El diálogo conserva foco y se cierra sin guardar.

### 5. Administración

#### 5.1. admin-video-actions

**File:** `tests/qa-baseline.spec.ts`

**Steps:**

1. Abrir `/admin`.
   - expect: Tabla, búsqueda y acciones principales son visibles.
2. Abrir `Agregar video por URL`.
   - expect: El botón está deshabilitado sin URL y se habilita con una URL válida.
3. Sincronizar canal y un video.
   - expect: Se muestran resultados de éxito.
4. Eliminar un video.
   - expect: La confirmación nativa se inspecciona y se puede descartar.
5. Cambiar a `390x844`.
   - expect: La indicación de desplazamiento y los controles siguen visibles.

### 6. Responsive transversal

#### 6.1. canonical-protected-views-at-baseline-viewports

**File:** `tests/qa-baseline.spec.ts`

**Steps:**

1. Recorrer `/patients`, `/patients/:patientId`, `/patients/:patientId/evolutions/:evolutionId`,
   `/patients/:patientId/evolutions/new`, `/chat`, `/c/:conversationId`, `/assistant`,
   `/a/:threadId`, `/admin` y una ruta 404 en `1440x1000`, `1280x800`, `1024x768` y `390x844`.
   - expect: Cada ruta muestra un elemento principal visible.
   - expect: El documento no presenta overflow horizontal.

## Evidence policy

- `PASS`: assertions observables, snapshot cuando corresponda y ausencia de errores de runtime.
- `BLOCKED`: dependencia externa o credencial no disponible; no se interpreta como fallo de UI.
- `NOT RUN`: cobertura opt-in, como Google Provider Smoke, no ejecutada en el baseline determinista.

Cada escenario debe usar locators semánticos, mocks de API aislados y un estado
de inicio independiente.
