# Contrato visual con evidencia live

Complementa mirror-audit.md y notes-contract.md. Base de browser: artifacts/diagnosis-parity-live-20261006. No son assets para producción ni aceptación del target futuro.

## Inventario observado y decisiones de marca

Native Codex Playwright recorrió8 categorías: Diagnóstico12, Restauradora29, Cirugía9, Endodoncia10, Ortodoncia4, Preventivo1, Periodoncia1 y Odontopediatría6 =72 opciones live. Target75 agrega tube/band/overfill fallback conforme al contrato. Iconos/SVG, colores computados, indicador de superficie y dimensiones de cada opción se conservaron como evidencia JSON. Usar autores propios para los dibujos finales, nunca v-html o SVG fuente importado.

Dental AI mantiene su workbench oscuro, tokens blue/slate, typography y lucide-react para navegación/acciones. No recolorear el Chat, agregar un selector global de tema ni sustituir todas las superficies de la app por las cálidas de DentalPin. Introducir tokens dentales semánticos para anatomía/categorías/marcas/preview. La tabla source light/dark informa esos tokens; dark es el modo activo del target y light referencia de diseño, no una nueva funcionalidad de tema aprobada.

## Iconos clínicos y overrides de variante

Fuente TreatmentIcons.ts:499–518 y TreatmentBar.vue:216,252,872. Resolver override por variant_id antes del icono clínico base. La leyenda de tipos puede mantener el icono base; tarjeta/registro que identifica variante usa su icono resuelto.

| Variante | Icon key fuente | Distinción visible requerida |
|---|---|---|
| REST-BRIDGE-MC | bridge_metal_ceramic | banda de base metal bajo tres unidades conectadas |
| REST-BRIDGE-ZIR | bridge_zirconia | motivo brillante/rombo en el póntico |
| REST-BRIDGE-MARY | bridge_maryland | póntico central con alas de retención, sin coronas pilares ficticias |
| REST-CROWN-IMPL-MC/ZIR | crown_on_implant | corona sobre tornillo de implante |
| REST-CROWN-IMPL-PROV | provisional_crown_on_implant | contorno discontinuo y relleno más ligero |
| REST-SPLINT-OCC | splint_occlusal | arco y puntos de contacto oclusal |
| REST-SPLINT-PERIO | splint_periodontal | piezas unidas con alambre de contención |

Los demás usan el tipo base documentado. 24×24/viewBox24 en una zona26px, trazos fuente habitualmente1.25–1.5px con detalles, silueta dental y marcas específicas. No utilizar círculos/flechas genéricas como reemplazo de toda la semántica. Pulpitis debe indicar canal pulpar; caries manchas; incipiente puntos; periapical tres tamaños en ápice; missing pieza ausente; desplazamiento ejes; unerupted contorno atenuado. El icono de paleta no es el renderer de capas del diente. Probar detalles a escala24 y targets44; el glyph no necesita medir44.

## Colores por función

Tabla extraída del código; alias legacy solo para resolver historia, no botones nuevos. Los iconos de Dental AI actuales medidos heredan rgb(148,163,184) para los12 hallazgos. Sustituir esa uniformidad en el dominio dental, preservando labels legibles. Textos principales siguen text-foreground; secundarios text-muted. Estado nunca depende solo del color.

| Tipo fuente | Light | Dark |
|---|---|---|
| pulpitis | #EF4444 | #F87171 |
| caries | #EF4444 | #F87171 |
| incipient_caries | #F97316 | #FB923C |
| pigmentation | #92400E | #D97706 |
| fracture | #BE185D | #EC4899 |
| missing | #6B7280 | #9CA3AF |
| periapical_small | #EF4444 | #F87171 |
| periapical_medium | #DC2626 | #EF4444 |
| periapical_large | #B91C1C | #DC2626 |
| rotated | #8B5CF6 | #A78BFA |
| displaced | #F59E0B | #FBBF24 |
| unerupted | #9CA3AF | #D1D5DB |
| filling_composite | #3B82F6 | #60A5FA |
| filling_amalgam | #6B7280 | #9CA3AF |
| filling_temporary | #22C55E | #4ADE80 |
| sealant | #06B6D4 | #22D3EE |
| veneer | #EC4899 | #F472B6 |
| inlay | #3B82F6 | #60A5FA |
| overlay | #3B82F6 | #60A5FA |
| crown | #F59E0B | #FBBF24 |
| crown_on_implant | #F59E0B | #FBBF24 |
| provisional_crown_on_implant | #FCD34D | #FDE68A |
| pontic | #F97316 | #FB923C |
| bridge_abutment | #FBBF24 | #FDE68A |
| bridge | #F59E0B | #FBBF24 |
| splint | #3B82F6 | #60A5FA |
| extraction | #DC2626 | #EF4444 |
| implant | #10B981 | #34D399 |
| apicoectomy | #6366F1 | #818CF8 |
| root_canal_full | #8B5CF6 | #A78BFA |
| root_canal_two_thirds | #8B5CF6 | #A78BFA |
| root_canal_half | #8B5CF6 | #A78BFA |
| post | #7C3AED | #A855F7 |
| root_canal_overfill | #3B82F6 | #60A5FA |
| bracket | #6366F1 | #818CF8 |
| tube | #6366F1 | #818CF8 |
| band | #8B5CF6 | #A78BFA |
| attachment | #EC4899 | #F472B6 |
| retainer | #14B8A6 | #2DD4BF |
| filling | #3B82F6 | #60A5FA |
| root_canal | #8B5CF6 | #A78BFA |
| bridge_pontic | #F97316 | #FB923C |
| rotate | #8B5CF6 | #A78BFA |
| displace | #F59E0B | #FBBF24 |

Importante: endodoncia usa violeta en paleta pero relleno pulpar azul en getPulpConfig; no propagar automáticamente paletteColor a layerColor. Las marcas de capa usan la configuración source específica (surface fill/dots/outlines, patrones de crown/inlay/overlay, símbolos laterales). Registry conserva ambos roles. Root/crown/detail/outline/chart/background/selection tokens siguen mirror-audit y main.css:251–288. Comparar el color computado final por rol; no basta comprobar strings en metadata.

## Estados y motion medidos

Caries seleccionada en source light: background rgb(239,246,255), border rgb(59,130,246), halo rgba(59,130,246,.2) de3px. Dot ::after rgb(6,182,212),6px, top/right4, significa superficies. Card min-height72, transition background/border/box-shadow/transform150ms. No es contador de usos. La tarjeta puede elevarse2px en hover; diente1px, glows y pulses según mirror-audit. En reduced-motion quitar movimiento decorativo, conservar color/outline y foco. Labels/español no heredan texto microscópico de la fuente si pierde legibilidad en el shell target; registrar adaptación de tipografía sin cambiar significado.

Modal de superficies fuente tiene vista oclusal y lateral, M/D/O/V/L, contador y Confirmar deshabilitado con0 superficies; M/O puede revisarse y Cancelar no registra. Tooltip puede coincidir con modal en source: target cierra/suspende popover al abrir modal, un solo foco atrapado y restauración al caller. Mantener contexto durante la salida para no mostrar Pieza0/unknown en la animación.

## Mejoras fuente que no se deben copiar

Bug source confirmado a441×792 CSS: Notas y Open IA tienen el mismo rect x375.29/y740.14/w35.98/h35.98; z30 frente a40. elementFromPoint devuelve Open IA; click Notas abrió IA, Enter sobre Notas sí abrió el Sheet. CopilotMount.vue:22 y DiagnosisMode.vue:234 comparten fixed bottom-4/end-4; la barra inferior también ocupa esa zona.

Target Notas/Asistente debe tener zonas independientes44×44, separación≥8px y reservar altura real de cualquier dock/barra + safe-area antes de fijar bottom. Hit test del centro y de los bordes debe resolver la acción correcta; scroll, zoom y teclado también. No copiar coordenadas16px ciegamente. No duplicar un compositor oculto y otro visible: el DOM fuente tenía dos textareas al abrir mobile, pero target conserva un propietario de draft y feed.

## Matriz de aceptación futura

1. Fixture sintético equivalente en ambos sistemas:32 permanente/20 primaria, varios cuadrantes, crown+endo+caries, implant/missing, pontic/bridge, planned P, full/half/two-thirds pulp, long labels y notas. No comparar pixel a pixel pacientes distintos.
2. Capturar idle, hover/focus, selected, surface popup M/O, multi roles, saved edit, busy, success, conflict, error/retry y disabled; categoría y label siempre reconocibles. Independently authored geometry se compara por proporciones/capas/anchors, no identidad de path.
3. Tamaños CSS exactos1440×900,1280×800,1024×768,768×1024,430×932,390×844; verificar innerWidth antes. Probar shell/asistente abierto, local scroll, zoom200%, reduced-motion y pointer/keyboard. Texto4.5:1, foco/controles significativos3:1, hit targets44. Colores clínicos no sustituyen texto/shape.
4. Capturas native de esta sesión cubren441×792 en ambos, no desktop exacto: el override solicitado1440×1000 afectó únicamente la pestaña seleccionada y produjo1309×909 CSS por zoom; source permaneció441×792. Overrides restablecidos. No etiquetar esa tentativa como prueba desktop. CLI de fixture propio podrá producir tamaños exactos; no extraer cookies de IAB ni afirmar que CLI es el browser nativo.

La matriz final del target nuevo sigue pendiente de implementación. Los datos medidos permiten diseñarla y evitar pérdidas; no prueban paridad ya entregada.
