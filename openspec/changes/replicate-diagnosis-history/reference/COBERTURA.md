> Historical text recovered from this chat on 2026-10-17. Its previous binary screenshots were not recovered. This is prior context, not fresh visual proof. Fresh evidence and corrections are in ../audit/README.md.

# Matriz de interacción y aceptación

Complementa el [informe principal](README.md). «Comprobado» significa recorrido de UI, no garantía del backend. «Parcial» identifica el punto exacto donde termina la evidencia.

## Pasos ejercitados

| Paso | Entrada → acción → resultado | Estado |
|---:|---|---|
| 1 | Sesión CLI nueva → abrir destino → login público | Comprobado; límite de autenticación. |
| 2 | Navegador nativo → ficha abierta → Clinical/Diagnosis visible | Comprobado. |
| 3 | Pieza vacía → pulsar → número, anatomía y No treatments recorded | Comprobado. |
| 4 | Pieza con registros → pulsar → popover y Click to edit | Comprobado. |
| 5 | Permanent → Primary → gráfico de 20 piezas | Comprobado; captura 01. |
| 6 | Paleta → recorrer ocho categorías → inventario de 72 tarjetas | Comprobado como catálogo visible. |
| 7 | Caries → seleccionar → tarjeta activa, Cancel y ayuda de aplicación | Comprobado; captura 02. |
| 8 | Caries activa → pieza temporal → Select Surfaces | Comprobado. |
| 9 | Cero superficies → elegir M/O → contador 2 y Confirm habilitado | Comprobado; captura 03. |
| 10 | M/O → quitar ambas → contador 0 y Confirm deshabilitado | Comprobado. |
| 11 | Selector → Cancel → herramienta sigue activa; segundo Cancel → reposo | Comprobado. |
| 12 | Registro por superficies → abrir editor → estados, superficies, Notes | Comprobado; cancelado sin guardar. |
| 13 | Pulpitis → abrir editor → Existing y Notes, sin superficies | Comprobado; cancelado sin guardar. |
| 14 | Editor → Delete → confirmación irreversible con foco en Cancel | Comprobado hasta confirmación; borrado final pendiente. |
| 15 | Confirmación → Cancel → editor anterior | Comprobado. |
| 16 | Whole mouth → First Visit → foco/resaltado, sin modal observado | Parcial; función adicional no confirmada. |
| 17 | Legend → desplegar → estados y grupos de símbolos | Comprobado para el contenido inspeccionado. |
| 18 | Diagnosed conditions → plegar/reabrir → conserva título y contador | Comprobado; captura 06. |
| 19 | Treatment notes (1) → abrir → nota, metadatos y Open context | Comprobado; texto clínico omitido de archivos. |
| 20 | Treatment notes (0) → abrir → estado vacío | Comprobado. |
| 21 | Add note → formulario → foco textarea y Save deshabilitado | Comprobado; captura 05. |
| 22 | General follow-up → plantilla → Save habilitado | Comprobado; borrador cancelado. |
| 23 | Adjuntar / Open context | Controles observados; acciones pendientes. |
| 24 | Set recall → modal → motivo, fecha, prioridad, nota | Comprobado; captura 04; guardado pendiente. |
| 25 | Pick a specific day → expandir → campo de fecha | Comprobado; calendario y selección final pendientes. |
| 26 | Notas → activar → IA/Chat | Comprobado como salida inesperada; sin envío. |
| 27 | Note rápido → activar → Summary con #new-note | Comprobado solo como salida. |
| 28 | History → abrir → Timeline, View only y acordeones | Comprobado. |
| 29 | Slider → Home / ArrowRight / End → posiciones 0/1/3 | Comprobado; posición 2 observada al entrar. |
| 30 | Return to current state → pulsar → Today dentro de History | Comprobado. |
| 31 | Timeline histórico → comparar marca y State at → un día de diferencia | Comprobado; captura 07. |
| 32 | Treatment List / Change History → desplegar → entradas y contadores | Comprobado para el caso observado. |
| 33 | History → pieza → condición → editor con Save/Delete | Comprobado dos veces; captura 08; escritura pendiente. |
| 34 | Navegación nueva a URL original → Summary → volver a Clinical | Comprobado; problema de restauración de estado. |
| 35 | Cancelar formularios y cerrar sesión CLI propia | Comprobado; pestaña nativa preservada en Diagnosis. |

## Criterios para una reconstrucción de UI

Estos criterios son una especificación derivada del recorrido, no tests automatizados ya implementados.

- [ ] Mantener un contexto de paciente estable entre Diagnosis e History.
- [ ] Representar correctamente 32 piezas permanentes y 20 temporales con ambas vistas.
- [ ] Separar inspección de una pieza y aplicación de una herramienta.
- [ ] Identificar de forma inequívoca la condición activa y permitir salir del modo de aplicación.
- [ ] Mantener selecciones de superficie como borrador hasta la acción de confirmación definida.
- [ ] Sincronizar dibujo, botones, chips y contador de superficies.
- [ ] Deshabilitar Confirm con cero superficies y explicar la restricción.
- [ ] Variar el editor según alcance y estados permitidos por la condición.
- [ ] Confirmar un borrado irreversible indicando exactamente el registro afectado.
- [ ] Cancelar esa confirmación devuelve al editor y conserva su contexto.
- [ ] Separar campo Notes y colección de notas contextuales.
- [ ] Mostrar estados de notas vacías, cargando, con resultados, guardando y error.
- [ ] Definir formato y persistencia de adjuntos antes de replicar el control.
- [ ] Dar a cada contador una unidad y un filtro explícitos.
- [ ] Definir qué ocurre con el listado inferior al cambiar la dentición.
- [ ] Definir si History es estrictamente de lectura; alinear controles con esa política.
- [ ] Usar la misma interpretación de fechas en slider, tooltip, State at y eventos.
- [ ] Hacer que Return to current state lleve al presente sin ambigüedad de modo.
- [ ] Serializar pestaña principal y modo clínico en enlaces/restauración.
- [ ] Proveer nombres y estados accesibles para piezas, tarjetas y superficies seleccionadas.
- [ ] Gestionar foco inicial, Escape, retorno del foco y scroll de cada capa.
- [ ] Mantener acciones legibles por encima de la barra inferior en pantallas estrechas.
- [ ] Respetar reducción de movimiento y evitar resetear datos durante una salida animada.

## Prueba pendiente con datos desechables

1. Crear un registro por superficies y comprobar gráfico, listado y recarga.
2. Crear un registro de pieza completa y comprobar si la aplicación es inmediata o tiene confirmación.
3. Editar estado/superficies y verificar historial, recarga y ausencia de duplicados.
4. Guardar una nota, comprobar autor/fecha/contexto y abrir su destino.
5. Adjuntar un archivo de prueba y comprobar restricciones y eliminación del adjunto.
6. Crear un recall, comprobar fecha/zona horaria y asociación al contexto correcto.
7. Probar fallo de guardado y comprobar conservación de borradores.
8. Intentar edición desde History para verificar la política real del servidor.
9. Eliminar exclusivamente un registro desechable y comprobar todas las vistas derivadas.
10. Limpiar solo los datos creados por esa prueba mediante el mecanismo normal autorizado.

No se ejecutó esta secuencia sobre los registros existentes. Tampoco se atribuye a este informe cobertura de Treatment plans, Appointments, proveedores externos o una operación de borrado de consulta completa.
