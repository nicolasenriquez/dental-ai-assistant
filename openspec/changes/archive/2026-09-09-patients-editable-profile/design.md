## Context

El esquema `patients` ya contiene todos los campos necesarios: nombres, apellidos, RUT normalizado, fecha de nacimiento y `updated_at`. El backend ya posee normalización módulo 11, respuestas enmascaradas y aislamiento por propietario.

## Decisions

1. Usar `PATCH /api/patients/{patient_id}` con `first_name`, `last_name`, `birth_date` y `rut` opcional. Omitir `rut` o enviarlo como `null` conserva el RUT almacenado.
2. Validar nombres, fecha y RUT en FastAPI antes de actualizar. Un RUT duplicado del mismo propietario devuelve `409`; un paciente ajeno devuelve `404`.
3. Actualizar `updated_at` en la misma sentencia SQL y devolver la representación pública con `rut_masked`; nunca devolver `rut_number` ni `rut_dv`.
4. Reutilizar un único `PatientFormModal`. En edición el RUT se muestra enmascarado y no editable inicialmente; `Cambiar RUT` abre un campo vacío y `Conservar RUT actual` cancela el reemplazo.
5. Guardar permanece en la ficha, actualiza la cabecera, conserva la evolución seleccionada y muestra `Paciente actualizado`. Los errores conservan los valores ingresados.
6. Usar confirmación nativa al cerrar un formulario con cambios sin guardar. No añadir dependencia ni componente de diálogo nuevo.

## Data Flow

1. `PatientDetail` carga el paciente y abre el modal con nombres, apellidos y fecha precargados.
2. El modal convierte la fecha visible `dd/mm/aaaa` a `YYYY-MM-DD` y envía el RUT solo si el profesional activó su cambio.
3. La ruta valida propiedad y campos, el repositorio ejecuta el `UPDATE` owner-scoped y devuelve el paciente actualizado.
4. La UI actualiza la identidad local sin recargar ni modificar evoluciones.

## Failure Handling

- `422`: mantener el modal abierto y mostrar un error de datos.
- `409`: informar que el RUT ya pertenece a otro paciente.
- `404` o error de red: mantener el formulario y mostrar un error recuperable.
- Cierre con cambios: confirmar antes de descartar.

## Verification

- Contratos backend para autenticación, campos, SQL owner-scoped, preservación del RUT y respuesta enmascarada.
- Pruebas frontend para precarga, guardado, RUT enmascarado, confirmación de cierre y conservación de la ruta.
- TypeScript, Biome y suite backend focalizada.
