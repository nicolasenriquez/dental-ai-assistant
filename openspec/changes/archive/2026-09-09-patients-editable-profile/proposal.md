## Why

DynaChat permite crear y consultar pacientes, pero no corregir sus datos básicos después de la creación. Eso obliga a conservar errores de identidad y reduce la utilidad operativa del directorio.

## What Changes

- Añadir actualización autenticada y propietario-scoped mediante `PATCH /api/patients/{patient_id}`.
- Permitir editar nombres, apellidos y fecha de nacimiento; permitir cambiar el RUT solo mediante una acción explícita.
- Reutilizar el modal de paciente desde la ficha, conservar el historial clínico y proteger el RUT completo.
- Añadir pruebas de contrato y estados de error sin cambiar el esquema de base de datos.

## Capabilities

### New Capabilities

- `patient-editable-profile`: actualización segura de los datos básicos de un paciente.

### Modified Capabilities

- `patient-dental-evolutions`: la ficha de paciente deja de ser estrictamente de solo lectura para sus datos demográficos; las evoluciones permanecen de solo lectura.

## Out Of Scope

- Teléfono, dirección, contacto, odontograma o nuevos datos demográficos.
- Edición o eliminación de evoluciones clínicas.
- Auditoría clínica, historial de cambios o migraciones de esquema.
- Nueva página o ruta de edición separada.

## Impact

- Amplía el repositorio y la ruta autenticada de pacientes.
- Extrae el modal existente a un componente compartido entre creación y edición.
- Añade el botón de edición en la ficha y mantiene intactos Chat, evoluciones y navegación.
