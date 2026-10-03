# Propuesta de motion, 3 octubre 2026

Propuesta sin cambios de implementación. Reconocimiento del frontend React 18, Tailwind 3,
Radix y `motion` ya instalado. Estado gestionado con hooks y Context; clientes API tipados.
Se conserva la arquitectura página → dominio → patrón → primitive → token.
Los fixes UAT anteriores ya presentes en el índice no se modificaron.

## Evidencia y alcance

Browser nativo de Codex, sesión autenticada. Se inspeccionaron directorio, modal Nuevo paciente,
ficha y Diagnóstico. Se abrió y canceló el modal sin completar campos ni enviar formularios.
El foco volvió a Nuevo paciente. Modal y formulario tienen animation: none y transition-duration:
0s, viewport observado 805 × 792, sin overflow horizontal. Evidencia: animation-modal-before.jpg.
Una captura estática demuestra la composición, no la calidad temporal de una animación.

Los estados de guardado se verificaron en código, no provocando escrituras sobre el paciente.
Toast y esperas de red requieren validación posterior con respuestas controladas y datos sintéticos.
No se midieron FPS ni latencia. Las frecuencias siguientes son estimaciones del flujo clínico,
no telemetría.

## Oportunidades, orden recomendado

| Prioridad y ubicación | Hoy | Propósito | Frecuencia estimada | Receta y condición de aceptación |
| --- | --- | --- | --- | --- |
| 1. PatientNotes.tsx:401 y :510; PatientDiagnosis.tsx:681 y :835; PatientFormModal.tsx:564 | Texto de espera sin Spinner. El guard de diagnóstico incluso conserva Guardar y continuar durante saving. Evolución y Drive sí reutilizan Spinner. | Indicación de estado | Varias veces por consulta, únicamente mientras hay petición | Reutilizar Spinner de 14px, rotación CSS existente 1s linear infinite, posición consistente junto al texto. Un indicador por operación visible, aria-busy en la acción y estado textual accesible. Reservar espacio y ancho suficiente para ambos textos. Sin retraso artificial, sin porcentaje ficticio. Con movimiento reducido, icono estático y texto de espera. |
| 2. PatientFormModal.tsx:293–308 | Overlay y formulario aparecen instantáneamente | Evitar aparición brusca | Ocasional | Entrada del formulario opacity 0→1 y transform scale(.98)→scale(1), 180ms cubic-bezier(0.23,1,0.32,1); overlay opacity 0→1, 150ms misma curva. Sin bloquear interacción ni retrasar foco. Movimiento reducido: sin scale y respetar la regla global actual. Primera entrega solo entrada; cierre inmediato para no añadir un estado de desmontaje. |
| 3. ToastProvider.tsx:25; globals.css:194 | Entrada keyframes 200ms ease desde translateX(24px); retirada inmediata | Continuidad espacial y feedback | Ocasional; puede haber ráfagas | Segunda entrega: transición opacity y transform, entrada 180ms y salida 120ms cubic-bezier(0.23,1,0.32,1), desplazamiento máximo 8px desde el mismo borde. Usar presencia existente de motion solo si se necesita retener el nodo durante salida. Movimiento reducido: sin desplazamiento, respetando política global. No cambiar duración de lectura ni roles durante este trabajo. |

La rotación continua del spinner no comparte el presupuesto de una transición de apertura.
No se propone acelerar todos los spinners sin observar el resultado. El Spinner actual usa
`animate-spin` de Tailwind y una protección global de movimiento reducido en globals.css:1531.

## Simplificación de motion existente

PatientWorkspace.tsx:151 remonta el detalle por UUID. globals.css:1410 aplica entrada de 160ms
con desplazamiento vertical de 4px. Recomiendo probar su eliminación al alternar evoluciones:
es información que se lee repetidamente. No extender ese efecto a las pestañas ni a toda la ficha.
Es una propuesta basada en el código, pendiente de comprobar en navegación repetida.

## Candidatos descartados

- Odontograma y selección de pieza: información clínica funcional; mover dientes, símbolos o
  superficies dificulta comparar. Mantener selección inmediata y distinguible del foco.
- Pestañas y navegación por teclado: frecuencia alta; no añadir fades, deslizamientos ni esperas.
- Mensajes SSE: no animar cada token ni reintroducir entradas al actualizar texto.
- Guardado exitoso: sin confeti ni bounce; texto confirmado por respuesta real es suficiente.
- Rail desktop: no añadir otra animación de ancho; preservar el comportamiento validado en UAT.

## Causa y ubicación

El problema principal es la composición independiente de los estados async en cada formulario.
Button.tsx es un wrapper visual y no conoce saving, reintento ni incertidumbre de la petición.
La solución inicial vive en los consumidores: import de Spinner y composición condicional.
Spinner.tsx sigue siendo el único dueño del icono. No crear LoadingButton, un motor de estados,
un provider de animaciones ni cambiar globalmente todos los botones disabled.

Disabled también significa formulario inválido o acción prohibida; no equivale a petición activa.
En los guards donde hay otra acción de guardado visible, el indicador debe tener un solo dueño.
Mantener UUID congelado, payload y tratamiento de 409/resultado incierto sin modificaciones.

El modal conserva sus mecanismos de foco, Escape, bloqueo y cierre. La entrada se localiza en su
formulario; no animar todos los forms. Para toast, la salida necesita coordinación con desmontaje;
por eso se entrega aparte, sin reemplazar el sistema de notificaciones por Sonner.

## Preview representativo, no aplicado

```diff
--- a/app/frontend/src/components/patients/PatientNotes.tsx
+++ b/app/frontend/src/components/patients/PatientNotes.tsx
@@ composición de la acción de guardar
+import { Spinner } from '../Spinner';
@@
 <Button
   type="submit"
   variant="clinical"
+  aria-busy={saving}
   disabled={saving || conflictPending || !draft.body.trim()}
 >
-  {saving ? 'Guardando…' : attempt ? 'Reintentar guardado' : 'Guardar nota'}
+  <span className="inline-flex items-center justify-center gap-2">
+    {saving && <Spinner />}
+    {saving ? 'Guardando…' : attempt ? 'Reintentar guardado' : 'Guardar nota'}
+  </span>
 </Button>
```

Este fragmento ilustra composición; no es el parche completo. Antes de aplicar, medir ancho de
los textos normal, espera y reintento en 320px. Reservar el ancho máximo en cada contexto sin
forzar un mínimo global que genere overflow. El spinner puede ir a la derecha si esa es la
decisión visual, pero la posición debe coincidir con los consumidores de evolución y Drive.

## Roadmap y validación

1. Composición de guardado en notas, diagnóstico y formulario. Tests con promesas pendientes,
   resolución, error y reintento. Validar texto, aria-busy, bloqueo y ausencia de spinner duplicado.
   En browser, datos sintéticos y espera controlada: ancho antes/durante/después, 320px y desktop,
   foco y movimiento reducido. Ningún timer para fingir progreso.
2. Entrada local del modal. Verificar abrir/cerrar repetidamente, Escape, foco inicial y restaurado,
   scroll móvil. Comparar normal y movimiento reducido; no cambiar guardas de trabajo sucio.
3. Toast y simplificación del detalle, si la observación temporal confirma beneficio. Comprobar
   ráfagas, cierre durante entrada, permanencia de lectura y ausencia de mensajes duplicados.

Formato y estática: Biome, TypeScript y tests de regresión del repo. Prettier CLI es un formateador,
no una herramienta de validación visual, y no se incorpora un segundo formateador. Si se pretendía
Playwright CLI, esta revisión usó los locators Playwright del browser nativo como solicitado.
La implementación futura debe ejecutar checks apropiados y el build Docker; antes de commit,
AGENTS.md requiere además toda la suite backend. No se corrieron suites para esta propuesta
documental; no se afirma que se hayan validado animaciones todavía inexistentes.

## Fuentes

- https://github.com/emilkowalski/skills/tree/main/skills/find-animation-opportunities
- https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md
- PRODUCT.md, DESIGN.md, .impeccable/surfaces/patient-workspace.md y código local inspeccionado.

Se usan las recetas de Emil como referencia, adaptadas al contrato clínico. No se instalaron
skills ni paquetes. Handoff sugerido: implementar únicamente la primera entrega y revisar su
evidencia antes de ampliar motion. Esta propuesta es sostenible porque conserva las fronteras
de estado, reutiliza el Spinner y evita introducir infraestructura para efectos pequeños.
