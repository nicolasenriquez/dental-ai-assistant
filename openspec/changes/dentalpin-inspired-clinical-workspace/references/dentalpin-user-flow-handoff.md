# DentalPin: handoff del flujo y la experiencia

## Resumen

DentalPin es un espacio de trabajo para operar una clínica dental. El recorrido más común empieza en el panel, donde recepción o el profesional detecta qué requiere atención. Desde allí abre la agenda, busca una persona o sigue un pendiente financiero. La ficha del paciente reúne el contexto y las acciones que normalmente obligan a saltar entre módulos.

La sensación general es de un panel operativo: superficies claras, bastante espacio en blanco, azul para acciones y navegación activa, verde para estados favorables y rojo para deuda vencida. La interfaz separa bien las tareas por áreas. En escritorio predomina el acceso por barra lateral; en el ancho reducido del browser de Codex, la navegación se convierte en un menú móvil y el contenido se apila.

## Contexto de esta revisión

- Aplicación abierta: DentalPin, http://localhost:3000/, desplegada localmente en Docker y ya autenticada en el browser nativo de Codex.
- Cuenta y clínica visibles: entorno de demostración con rol de administración. El conjunto de datos parece sembrado.
- Idioma observado: inglés. Los datos de ejemplo y la clínica tienen formato español y moneda euro.
- Vistas recorridas: inicio, navegación principal, pacientes, ficha de paciente, agenda, recalls, planes de tratamiento, presupuestos, facturas, pagos, reportes, ajustes y el panel del Copilot.
- En escritorio se revisó el diseño a 1280 × 900; el ancho original de la pestaña era de aproximadamente 689 px. El tamaño temporal del viewport se restablece al terminar.
- Se abrieron controles de filtros y orden, el formulario vacío de alta y los paneles del Copilot. No se guardó ningún paciente, no se registró ningún pago, no se envió ningún mensaje y no se ejecutó ninguna llamada.
- No se incluyen nombres, teléfonos, saldos por persona, diagnósticos ni notas clínicas del conjunto de demostración.
- playwright-cli list informó que no había una sesión de navegador conectada. Para respetar la sesión autenticada ya abierta, el recorrido se hizo en el browser nativo de Codex usando sus locators de Playwright. No se abrió otro navegador.
- Las capturas del browser nativo se inspeccionaron durante el recorrido, pero su API no ofreció una ruta para guardarlas en el workspace. Por eso este archivo contiene las observaciones y los estados vistos, no archivos de imagen.

## Mapa de navegación

El menú observado presenta estas áreas:

| Área | Ruta | Para qué sirve |
| --- | --- | --- |
| Inicio | / | Resumen del día y entradas a tareas pendientes. |
| Agenda | /appointments | Calendario de citas y creación de una cita. |
| Pacientes | /patients | Buscar, filtrar, ordenar y abrir fichas. |
| Recalls | /recalls | Seguimiento de pacientes que requieren contacto. |
| Planes de tratamiento | /treatment-plans | Revisar el avance de planes y detectar los que necesitan cotización o cita. |
| Presupuestos | /budgets | Crear y seguir propuestas económicas. |
| Facturas | /invoices | Consultar documentos emitidos, vencimientos y saldos. |
| Pagos | /payments | Consultar cobros, método, reembolsos y anticipos sin asignar. |
| Reportes | /reports | Resumen de actividad y cifras por periodo. |
| Ajustes | /settings/general | Clínica, espacios, equipo, catálogo, facturación, integraciones, módulos y preferencias. |

En escritorio, la barra lateral queda fija a la izquierda. En móvil o en un panel estrecho aparece el botón de menú y se abre un cajón lateral. Las secciones Clínica, Finanzas y Práctica se pueden contraer. La ruta activa queda resaltada. El enlace a Ajustes aparece junto al perfil en el pie de la barra.

La cabecera compartida muestra la clínica y accesos a Ayuda, densidad, tema claro/oscuro y cierre de sesión. Ayuda abre un panel contextual con documentación; desde allí también se puede abrir el manual completo. El botón flotante Open IA abre el Copilot en un panel lateral.

## Inicio

El inicio cambia el saludo según la hora y muestra la fecha según el idioma configurado. En la parte superior ofrece dos acciones: crear un paciente y crear una cita. El botón de cita tiene mayor peso visual. El código condiciona ambos botones al permiso de escritura correspondiente.

Debajo hay tres indicadores de lectura rápida:

- Citas de hoy.
- Personas que están en la clínica en ese momento.
- Facturas vencidas.

La línea de tiempo de hoy marca la hora actual, distribuye las citas por hora y permite abrir una cita. Open schedule lleva a la agenda completa. En el ancho móvil el calendario horario conserva su propio desplazamiento horizontal.

El resto del panel se compone de widgets registrados por los módulos activos y los permisos de la persona que inició sesión:

- **Citas de mañana sin confirmar.** Si no hay pendientes, aparece un estado vacío que confirma que todas están confirmadas.
- **Facturas vencidas.** Incluye un acceso a todas las facturas y filas que llevan al documento correspondiente.
- **Recalls.** Resume los que vencen esta semana, los atrasados, los programados en el mes y la conversión; Call list abre Recalls.
- **Pacientes recientes.** Lista accesos a las fichas abiertas hace poco; Patients abre el directorio.
- **Week at a glance.** Compara los últimos siete días con los siete anteriores para citas, citas completadas y facturación.

En escritorio, los indicadores se distribuyen en una fila de tres y los widgets ocupan dos columnas. En 689 px, los paneles se apilan; el contenido sigue siendo legible, pero la línea de tiempo requiere desplazamiento horizontal. El rojo da prioridad a la deuda vencida y el resto de la jerarquía se apoya en títulos, texto y enlaces.

## Pacientes

La página tiene un título, una acción New patient y una barra de búsqueda. El texto visible del campo es Name or phone. En escritorio, estado, exclusión de contacto y deuda aparecen como controles junto a la búsqueda. En el ancho móvil se agrupan detrás de Filters.

### Búsqueda, filtros y orden

- **Search.** Filtra el directorio en el mismo lugar. El estado de la lista se mantiene sincronizado con la URL.
- **Status.** Active es el valor inicial; también existe Archived. El menú permite seleccionar ambos estados. La documentación indica que limpiar estado puede incluir archivados además de activos.
- **Only do-not-contact.** Filtra personas marcadas para no recibir contactos.
- **With debt.** Filtro aportado por el módulo de pagos. El módulo Pacientes consulta qué IDs tienen deuda y luego los cruza con sus propios resultados. Los datos de resumen financiero de cada fila también se cargan desde Pagos.
- **Sort.** Las opciones observadas son Last visit, Last name, First name, Joined y Recently edited. La dirección se controla con un botón aparte; el valor inicial es última visita descendente.
- **Clear / Apply.** En el panel móvil, se limpian o aplican los filtros. Al abrirlo se muestra el estado actual.

El listado muestra iniciales, nombre con apellidos primero, un dato de contacto, estado y, cuando Pagos puede proporcionar el resumen, deuda o saldo a favor. Un indicador de campana señala la preferencia de no contactar. La fila completa abre la ficha.

Hay un límite importante en With debt: si falla la consulta de Pagos o el usuario no tiene acceso a ese módulo, el código deja de aplicar ese filtro sin presentar un error visible. Conviene confirmar el permiso y la respuesta del servicio si los resultados parecen no corresponder con la opción seleccionada.

La consulta observada tenía 15 registros y no necesitó paginación. El código configura 20 filas por página y admite cambiar el tamaño desde el componente común de listas. La paginación real no se pudo comprobar con este conjunto.

### Alta de paciente

New patient abre un modal. Nombre y apellidos son obligatorios. Teléfono, email, documento, fecha de nacimiento y notas son opcionales. Guardar crea el registro, muestra confirmación, actualiza el listado y abre la ficha recién creada. El flujo exige permiso de escritura. Durante la revisión se cerró el formulario vacío con Cancelar.

### Vacío y errores

Si no hay pacientes, la página ofrece un estado vacío con una acción para crear el primero. Si no hay resultados por búsqueda o filtros, muestra un mensaje distinto y no presenta esa invitación inicial. La carga, error y paginación se delegan al componente compartido de lista.

## Ficha del paciente

La ficha tiene una cabecera persistente con avatar de iniciales, nombre, estado, edad y accesos de teléfono y email. Ofrece Edit y un menú Actions. Los riesgos clínicos críticos pueden aparecer en esa cabecera cuando están configurados. La ficha mantiene el paciente como contexto mientras se navega entre pestañas.

Las pestañas visibles en esta ejecución fueron Summary, Info, Clinical, Administration, Gallery y Activity. El contenido de algunas pestañas lo aportan módulos distintos, por lo que puede variar según instalaciones y permisos.

### Summary

El resumen funciona como panel de situación del paciente. En la ficha observada aparecían tarjetas para:

- Plan activo y avance de tratamientos, con acceso al detalle del plan.
- Próxima cita o una indicación de que no hay una, con enlace para agendar.
- Última visita y acceso a esa cita.
- Balance y enlace al libro de cobros.
- Diagnósticos pendientes y acceso al odontograma.
- Historial médico y enlace para editarlo.

Las tarjetas son también accesos profundos: llevan a la parte del módulo que corresponde al dato, no solo a una pantalla genérica.

Las acciones rápidas visibles son Appointment, Budget, Document y Set recall. El resumen también contiene preferencias por canal (email, WhatsApp y SMS), un botón para añadir una nota administrativa, filtros de actividad (All, Administrative, Diagnosis, Treatment, Plan, Clinical) y un historial breve de recalls. Las entradas de la actividad tienen Open context para regresar al objeto que generó la nota o evento.

En la vista estrecha aparece una barra fija inferior con Appointment, Collect y Note. Mantiene las acciones frecuentes disponibles mientras se desplaza por la ficha.

### Otras pestañas

- **Info.** Identidad y datos extendidos de la persona. La edición se hace de forma explícita y guarda los campos de identidad.
- **Clinical.** Contexto clínico y odontograma, con diagnósticos, tratamientos, citas e historial clínico según los módulos activos.
- **Administration.** Presupuestos, facturas, pagos y documentos. Desde pagos se puede revisar deuda, crédito a cuenta y cobros asociados.
- **Gallery.** Archivos e imágenes relacionados con la ficha.
- **Activity.** Histórico cronológico de acciones y eventos.

La ficha usa relaciones y enlaces a los otros módulos para que las tareas sigan ligadas a la misma persona. Archivar es un cambio de estado con confirmación, no una eliminación física. La documentación indica que se necesita patients.write para editar y archivar.

## Agenda, recalls y módulos de trabajo

### Agenda

La ruta /appointments abre por defecto la semana. Ofrece vistas Week, Day y Kanban, botón para una nueva cita, controles de fecha con Today y anterior/siguiente, y filtros por gabinete y profesional. La cuadrícula separa días y horas, marca el día actual y diferencia gabinetes/profesionales por color. El fin de semana aparece sombreado. La ficha y el inicio enlazan a esta vista con el paciente o la cita como contexto.

### Recalls

Call list reúne cuatro indicadores y una lista de seguimiento. Hay filtros de mes, motivo, estado, prioridad y un interruptor para incluir atrasados. Export CSV descarga la lista. Cada fila tiene datos de contacto, motivo/estado y acciones de seguimiento; el botón Call puede iniciar un contacto. No se activó ninguna acción de contacto.

### Planes de tratamiento

La página muestra un pipeline con vistas To quote, Awaiting patient, No appointment, No next appointment, Closed y List. Incluye búsqueda por nombre o número y New plan. Cada fila resume paciente, número/estado del plan, progreso de tratamientos, presupuesto asociado y tiempo en el estado. Open lleva al plan.

### Presupuestos

La lista permite buscar por número o paciente, filtrar por estado, validez, profesional y fecha, y ordenar por creación. New quote abre la creación. Cada fila muestra número y versión, estado, fecha, importe y accesos al documento o acciones del registro. No se abrió ni modificó ningún presupuesto.

### Facturas

La lista tiene búsqueda por número o paciente, filtros de estado, vencimiento y fechas, orden por fecha de creación y New invoice. Las filas muestran estado, fechas, total y saldo pendiente, y abren el detalle de la factura.

### Pagos

La lista permite buscar por paciente o referencia y filtrar por método, fechas, paciente, reembolsos y cobros sin asignar. Se ordena por fecha y ofrece New payment. Las filas muestran el método y la referencia junto con el importe. Los controles de reembolso son sensibles; no se activaron.

### Reportes

El dashboard de reportes se controla por un rango de fechas. Los accesos rápidos llevan a Billing, Quotes, Schedule y Payments. El resumen incluye cobros, crédito del paciente, producción, ticket promedio, cobros en el tiempo, método de pago, producción por profesional, nuevos pacientes, ausencias y antigüedad de cuentas por cobrar. Cuando no hay datos, algunos bloques dicen No data in this range; no rellenan el espacio con valores inventados.

## Copilot

Open IA abre el panel de Copilot con pestañas To do y Chat. El chat incluye el campo Type your message… y Send, desactivado si no hay texto. En el estado inicial muestra flujos guiados para briefing diario, preparar una visita y cubrir un hueco; también ofrece tareas para buscar/resumir pacientes, revisar horarios, agendar, recalls, presupuestos y cobros.

To do agrupa pendientes de recalls y presupuestos. Seleccionar una tarea puede iniciar un flujo conversacional; no se seleccionó ninguna. El panel muestra el mensaje Your data is protected.

El README describe que el Copilot usa herramientas de los módulos y vuelve a validar permisos en cada operación. También declara que los identificadores se sustituyen antes de llamar al proveedor de modelo, que el texto clínico libre se excluye de la ruta cloud y que una escritura pide confirmación antes de ejecutarse. Estas garantías se revisaron en la documentación, no con una prueba de red en esta sesión.

## Ajustes

El inicio de Ajustes organiza páginas por categoría y tiene una búsqueda propia:

- General: perfil, marca y zona horaria de la clínica.
- Workspace: gabinetes, horario y disponibilidad.
- People: usuarios, roles e invitaciones.
- Clinical: catálogo, defaults y plantillas.
- Billing & tax: series de factura, IVA y cumplimiento fiscal.
- Communications: notificaciones, SMTP y plantillas.
- Integrations: servicios externos y proveedores.
- Modules: instalar, actualizar o desinstalar módulos.
- Account: perfil, contraseña e idioma.

La pantalla General enlaza a la información de la clínica. Los cambios de ajustes no se probaron.

## Flujo principal del usuario

1. Entra al inicio y detecta una cita, un paciente reciente, un recall o un pendiente de cobro.
2. Abre la agenda o busca al paciente desde el directorio.
3. Usa la ficha para revisar plan, citas, balance, diagnósticos e historial.
4. Ejecuta la acción pertinente: cita, presupuesto, documento, nota, recall o cobro.
5. Regresa al inicio, al módulo que recibe el cambio o a Reportes para revisar el resultado.
6. Si la tarea es compuesta, usa el Copilot para preparar el trabajo. Las acciones que escriben datos requieren confirmación según el contrato descrito por el repo.

## Impresión de UX y puntos a validar

La organización ayuda a pasar de "qué requiere atención" a "qué hago ahora". Inicio y ficha están bien conectados con agenda, pagos y recalls. El resumen del paciente evita que cada acción empiece desde cero. Los estados acompañan al texto y las listas ofrecen filtros cerca de sus resultados.

Hay tres puntos que conviene validar en una sesión de producto:

1. **Idioma.** La ejecución estaba en inglés pese al formato español de la clínica y sus datos. El producto ofrece preferencia de idioma en Ajustes → Account. Conviene comprobar que el primer acceso elige el idioma esperado.
2. **Apertura de ficha.** En el primer clic desde el listado, la vista tardó en reflejar la navegación. El test E2E del repositorio también documenta una carrera de hidratación al abrir una ficha desde una fila. No la doy por reproducida de forma concluyente aquí, pero merece verificación porque es el paso que conecta el directorio con el trabajo clínico.
3. **Ancho estrecho.** La agenda de hoy usa desplazamiento horizontal en el viewport móvil y los controles de filtros se esconden dentro de un panel. El comportamiento cabe en pantalla, aunque las citas de horas alejadas exigen desplazarse.

El browser de esta ejecución mostró además una barra de Nuxt DevTools y un indicador de carga. El código permite desactivarlos con configuración, así que parecen parte del entorno local y no del flujo de producción.

## Accesibilidad y límites

La inspección del árbol accesible encontró encabezados, botones y enlaces con nombres útiles, además de una lista de pestañas con selección anunciada. El panel de pacientes usa campos y botones identificables. Eso ayuda a lectores de pantalla, pero no equivale a una auditoría WCAG.

No se probó navegación completa con teclado, contraste calculado, zoom, lector de pantalla, animación reducida ni puntos de quiebre adicionales. Tampoco se enviaron formularios ni se activaron acciones de contacto o finanzas. Las vistas de pacientes se describen sin valores reales del registro.

## Referencias para continuar

- Repo revisado: C:\Users\nenri\OneDrive\Desktop\proyectos\pry-ai-evaluator\references\dentalpin, rama main, commit fc36a71bdf1778d45e44ed7f72fbd0536d0be842, sin cambios locales.
- Este handoff queda en artifacts dentro del workspace ai-tutor, que es el directorio habilitado para escritura. El repo de DentalPin se mantuvo intacto.
- Página de inicio: frontend/app/pages/index.vue y frontend/app/components/home/HomeGreeting.vue.
- Shell y navegación: frontend/app/layouts/default.vue, frontend/app/composables/useModules.ts y frontend/app/utils/navigation.ts.
- Listado: backend/app/modules/patients/frontend/pages/patients/index.vue.
- Ficha: backend/app/modules/patients/frontend/pages/patients/[id].vue.
- Guía de pacientes: docs/user-manual/es/patients/screens/list.md y docs/user-manual/es/patients/screens/detail.md.
- Widgets del inicio: plugins de slots de agenda, pacientes, recalls y reportes bajo backend/app/modules/*/frontend/plugins/slots.client.ts.
- Smoke tests de navegación y ficha: frontend/tests/e2e/smoke-navigation.spec.ts y frontend/tests/e2e/smoke-patient-detail.spec.ts.
