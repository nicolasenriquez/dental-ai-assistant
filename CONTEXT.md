# Contexto del dominio clinico

Este archivo fija el vocabulario del MVP de pacientes y evoluciones dentales. No define diagnosticos ni reemplaza el criterio profesional.

## Terminos

### Paciente

Persona atendida por el profesional autenticado. El propietario se identifica mediante `owner_user_id`; el RUT sirve para identificar y buscar dentro de la cuenta, nunca para relacionar registros clinicos.

### Evolucion

Registro dental asociado a un momento clinico (`evolution_at`) que conserva la nota rapida, el texto generado y el texto final aprobado. `created_at` registra cuando el sistema creo la fila y no sustituye ese momento clinico. Una evolucion existe como registro clinico solo despues de un guardado explicito.

### Borrador de IA

Conjunto de cinco bloques clinicos propuestos por el modelo a partir de la nota rapida actual y hasta tres evoluciones aprobadas anteriores. Un bloque sin evidencia queda vacio. El borrador no es un registro clinico, no se guarda al generarlo y puede ser editado o reemplazado por una regeneracion confirmada.

### Evolucion aprobada

Evolucion cuyo `final_text` fue revisado y guardado por el profesional. Es la unica fuente longitudinal que puede recibir una generacion posterior.

### Alerta de revision

Fragmento literal de la nota actual que el modelo no pudo interpretar sin asumir informacion clinica, acompañado por un motivo. Se muestra fuera de los bloques clinicos, no se incorpora automaticamente al texto final y no se persiste.

## Regla de autoridad

La IA redacta. El profesional revisa, edita y decide si guarda. Generar o regenerar nunca aprueba ni persiste una evolucion.
