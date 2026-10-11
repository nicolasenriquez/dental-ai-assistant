# Polish review, sin aplicación

Esta pasada evalúa la ejecución final del sistema existente. No se ejecutó un comando de polish que altere archivos, no se modificaron tokens y no se cambió DESIGN ni superficies.

## MUST FIX antes de declarar estos recorridos listos

| ID | Problema | Nivel de intervención | Verificación posterior |
|---|---|---|---|
| R03 | Texto clínico casi vertical en panel contextual | Defecto local de composición; reutilizar shell, priorizar escritura | Panel 420–520 px, Sheet y full; notas largas, voz y adjuntos |
| R02 | Decisión de contexto sin foco ni área de acción adecuada | Implementación incompleta de patrón modal/inline | Teclado, focus return, target size, AT; preservación A/B/null |
| R11 | Fallo de carga con bienvenida contradictoria y sin retry local | Estado funcional incompleto | Fallo transitorio y retry sin adquirir otro hilo |
| R04 | Etiqueta del draft retenido no describe origen | Conceptual mismatch entre estado actual y estado conservado | Origen correcto y envío bloqueado, no pérdida |
| R08 | Salto de heading en ruta completa | Defecto semántico compartido | Árbol de headings de ambas composiciones |

R01 es un gate de procedencia de prueba que se resuelve antes de validar, no un trabajo de polish visual. Los MUST FIX son criterios de preparación de estos recorridos, no una afirmación de que todos bloquean cada tarea.

## SHOULD FIX

- R07: conservar páginas y foco después de reintentar Drive; interfaz operacional estable.
- R05: un error por operación; volver “Recuperar borrador” al centro de la decisión. No eliminar avisos de errores distintos.
- R06: dock según visibilidad del artefacto, preservando ayuda en historia larga.
- R09: fecha/hora coherente con la atención y las demás superficies, tras confirmar el contrato de formato.

## NICE TO HAVE, con condición

R10: reducir Pending duplicado cuando sidebar expandido ya lo muestra. El beneficio depende del layout; no retirar accesos en rail/móvil. Ajustes de gaps y alineación de guard van con R02, no generan una campaña de padding global.

## Checklist de ejecución

| Área | Evidencia / valoración | Acción propuesta |
|---|---|---|
| Espacio y padding | Guard 35 carece de separación; input 30 ocupa 24.85 px | Corregir agrupación y prioridad de layout local |
| Tipografía | Campos coherentes; textarea panel destruye measure | No cambiar Inter; reflow por ancho del contenedor |
| Alineación | Desktop bounded; header reflow existente | Conservar sistema; revisar nombre largo en futuro |
| Densidad | Queue ocupa altura con 3 items sin pérdida observada | Mantener cap y controles; no truncar contenido silencioso |
| Hover/focus/active | Input y Drive muestran ring; review retorna foco; guard no | Reuse variantes existentes; completar focus del guard |
| Contraste | Percepción legible en dark, sin ratios medidos | Medir tokens/pares en estados definitivos; no recolorear aún |
| Botones | Revisar y guardar destacado; guard tiene 3 acciones iguales | Mantener primaria/safe, descarte secundario |
| Microcopy | Scope de Stop y guardado separado buenos | Clarificar origen conservado y error de carga |
| Empty | Sin trabajo y sin documentos dependen de contexto | No reutilizar bienvenida para carga fallida |
| Loading | Preparando respuesta explícito; skeleton en carga de lista visto | No porcentaje falso ni retraso decorativo |
| Errores | Draft no se perdió tras save-failure; carga no recupera local | Un propietario de error y siguiente acción |
| Transiciones | Fuentes cortas 160–200 ms; reduced-motion existe | No nuevas animaciones; probar preferencia real |
| Responsive | 360/390 funciona full; 768/1024 panel estrecho falla | Container width gobierna toolbar, no sólo viewport |
| Touch | Guard 21 px unido medido con pointer fine | Área según repo y prueba coarse; no afirmar compliance |
| Scroll | Composer accesible en móvil; artefacto puede quedar fuera de vista | Mantener recuperación fuera de vista; prueba historia larga |
| Repetición | Header Pending, review dock, error de operación | Reducir según visibilidad y causalidad, no por conteo |

No proponer gradientes, glass, ilustraciones, nuevos badges ni cambios de marca sin un beneficio demostrado. El pulido no debe esconder rediseño ni modificar aprobación, scope de Stop, memoria, identidad o semántica de Drive.

