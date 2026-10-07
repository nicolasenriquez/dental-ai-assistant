# Diagnóstico: cambios localizados y verificación

Implementación del 7 de octubre de 2026, basada en la auditoría del mismo día y en `references/dentalpin`.

## Cambios

- Clínica expone Diagnóstico y Evoluciones. Se retiraron Planificación, Planes y la continuación de borradores del diagnóstico.
- La API autenticada de creación de planes responde 410 sin ejecutar una escritura. Los enlaces antiguos con plan conservan una vista de consulta de datos y revisiones; no se borraron tablas, sesiones ni referencias.
- Se eliminaron los componentes y hook del editor de planes, sus pruebas de autoría retiradas y clientes frontend de comandos sin consumidores. Las pruebas del agregado histórico del backend crean sus fixtures mediante el servicio, no el endpoint retirado.
- El odontograma mantiene sus botones de piezas, selección gráfica de superficies y controles accesibles por cuadrante. Se retiraron el combo FDI y la banda adicional de 160 botones. El selector contextual mantiene cinco superficies, cancelación y confirmación.
- Selección y vínculo destacado siguen el contorno oclusal. Los rellenos y fisuras usan clips anatómicos; el hit testing exige estar dentro de la silueta. FDI inferior queda fuera de la vista oclusal.
- El selector muestra vistas lateral y oclusal separadas; no corta las raíces ni incluye el fragmento de otra vista. Usa el color clínico del concepto seleccionado.
- Las notas tienen un encabezado visible, editor libre, asociación opcional y tarjetas con borde lateral semántico. Se retiraron categorías de plantillas, selector, carga, estado, append y cliente no usado. Las notas previamente creadas no cambian.
- Hover/foco propone una pieza antes de escribir. Durante el borrador la asociación permanece estable; activar explícitamente otra pieza permite cambiarla. La edición de una nota existente sigue modificando sólo texto, como antes.
- Estado ofrece Actuales, Resueltas e Historial completo. El último conserva anotaciones de error. Los enlaces exactos a registros erróneos seleccionan ese historial.
- El rail de notas requiere 1160px disponibles; en menos espacio se utiliza Sheet. Su cierre devuelve foco a Notas. La cancelación del selector retorna a su pieza después de que vuelva a estar habilitada, sin reemplazar el foco de un registro guardado.
- La selección ya no pulsa indefinidamente. Preview usa el color del concepto; highlights y transiciones respetan movimiento reducido. Se mantiene el tema oscuro y los tokens existentes.

## Referencia y adaptación

Se tomaron de `ToothDualView.vue` y `SurfaceSelectorPopup.vue` el contorno anatómico, recorte de capas, orden de superficies y vistas separadas; de `DiagnosisMode.vue` la separación de chart/notes; de `NoteCard.vue` el borde semántico. Se adaptaron al renderer React existente. No se importó una biblioteca ni se reemplazaron los 75 conceptos.

Planes y plantillas se excluyeron por la decisión actual del usuario, aunque DentalPin los tenga. PRODUCT y el brief del paciente reflejan esa decisión. La auditoría y especificaciones anteriores permanecen como evidencia histórica, no como autorización para volver a exponer esas funciones.

## Verificación

- Frontend: TypeScript y Biome completos aprobados. Suite completa: 90 archivos, 780 pruebas aprobadas. Tras ajustes finales de encuadre/foco se repitieron las 50 pruebas de chart/diagnóstico y luego las 42 de diagnóstico con la regresión de retorno de foco: aprobadas.
- Backend: Ruff completo aprobado; 235 archivos cumplen formato. Mypy completo sin errores. Pytest: 967 aprobadas, 168 omitidas porque requieren bases/servicios de integración. La regresión del endpoint 410 verifica autenticación y que no alcance el servicio de escritura.
- Docker local reconstruido mediante `just dev-up-build`, conservando volúmenes. No hubo cambios de configuración de despliegue ni dependencias.
- Navegador nativo de Codex: ausencia de controles retirados, selección de Caries con Enter en pieza 16, M/O y habilitación de Confirmar, cancelación, notas sin plantillas y conservación del borrador al cerrar/reabrir. Escape devolvió foco a Notas en ventana estrecha. El borrador sintético se canceló sin guardar.
- Comprobación final de distribución: el contenedor del chart mide 1115px tanto de cliente como de contenido, sin recorte horizontal en la muestra de escritorio. FDI 48 empieza en y544.3 y la silueta oclusal termina en y536.4: ya no se intersectan. Cancelar superficies devuelve el foco a la pieza 16. Capturas finales: 24 (selector), 25 (chart) y 26 (notas).

No se escribieron diagnósticos ni notas en la ficha abierta por el usuario. Guardado, conflictos y reintentos están cubiertos por las pruebas de comportamiento existentes; no se presentan como nuevas escrituras end-to-end verificadas en esa ficha. Las 168 pruebas omitidas y la fidelidad con datos poblados en todas las categorías siguen siendo límites de esta verificación.

Evidencia y logs: `artifacts/diagnosis-simplification-20261007/`. Las capturas numeradas desde 21 muestran la implementación; 01–20 pertenecen a la auditoría previa.
