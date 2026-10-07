# Fixed Spanish catalog contract

Version: dental-clinical-v1. This inventory specifies target metadata, not reference code/assets or a billing catalog. Variant IDs below are stable target keys; reference internal codes provide traceability only. Each row requires a distinct Spanish card and saved label, server validation and independently authored illustration. No unlisted billable/global-mouth item is silently imported.

Categories: Diagnóstico, Restauradora, Cirugía, Endodoncia, Ortodoncia, Preventivo, Periodoncia, Odontopediatría. Existing twelve findings retain their own API and IDs: pulpitis, caries, incipient_caries, pigmentation, fracture, missing, periapical_lt_2mm, periapical_2_4mm, periapical_gt_4mm, rotated, displaced, unerupted. Reference periapical_small/medium/large map to those target codes and never create duplicates.

D03 mirror amendment: direct whole-tooth fracture creation follows the reference; legacy target fracture surfaces remain readable/editable so no historical data is lost. New surface selection uses M/D/O/V/L as the reference selector; no inferred veneer-V-only or pediatric-only API restriction is imposed. V means vestibular; O is displayed as Oclusal/incisal while retaining API code O. `both` means both dentitions are accepted for clinician entry, not a treatment recommendation. Inlay combines a surface selector with pattern rendering; veneer keeps its reference render convention without adding an unsupported validation rule.

| Variant ID | Category | Spanish display label | Clinical type | Scope | Allowed surfaces | Dentition | Visual family |
|---|---|---|---|---|---|---|---|
| PREV-SEAL | Preventivo | Sellador de fosas y fisuras | sealant | tooth | M D O V L | both | surface |
| REST-COMP | Restauradora | Obturación composite | filling_composite | tooth | M D O V L | both | surface |
| REST-AMAL | Restauradora | Obturación amalgama | filling_amalgam | tooth | M D O V L | both | surface |
| REST-TEMP | Restauradora | Obturación temporal | filling_temporary | tooth | M D O V L | both | surface |
| REST-INLAY-COMP | Restauradora | Incrustación de composite | inlay | tooth | M D O V L | both | pattern + surface selection |
| REST-INLAY-CER | Restauradora | Incrustación cerámica | inlay | tooth | M D O V L | both | pattern + surface selection |
| REST-OVER-COMP | Restauradora | Restauración de recubrimiento composite | overlay | tooth | — | both | pattern |
| REST-OVER-CER | Restauradora | Restauración de recubrimiento cerámico | overlay | tooth | — | both | pattern |
| REST-VEN-COMP | Restauradora | Carilla composite | veneer | tooth | M D O V L | both | surface |
| REST-VEN-PORC | Restauradora | Carilla porcelana | veneer | tooth | M D O V L | both | surface |
| REST-VEN-ZIR | Restauradora | Carilla zirconio | veneer | tooth | M D O V L | both | surface |
| REST-CROWN-MC | Restauradora | Corona metal-cerámica | crown | tooth | — | both | pattern |
| REST-CROWN-ZIR | Restauradora | Corona zirconio | crown | tooth | — | both | pattern |
| REST-CROWN-DISI | Restauradora | Corona disilicato de litio | crown | tooth | — | both | pattern |
| REST-CROWN-METAL | Restauradora | Corona metal | crown | tooth | — | both | pattern |
| REST-CROWN-PROV | Restauradora | Corona provisional | crown | tooth | — | both | pattern |
| REST-CROWN-IMPL-MC | Restauradora | Corona sobre implante metal-cerámica | crown_on_implant | tooth | — | both | pattern |
| REST-CROWN-IMPL-ZIR | Restauradora | Corona sobre implante zirconio | crown_on_implant | tooth | — | both | pattern |
| REST-CROWN-IMPL-PROV | Restauradora | Corona provisional sobre implante | provisional_crown_on_implant | tooth | — | both | pattern |
| REST-BRIDGE-MC | Restauradora | Puente metal-cerámica | bridge | multi_tooth | — | both | pattern |
| REST-BRIDGE-ZIR | Restauradora | Puente zirconio | bridge | multi_tooth | — | both | pattern |
| REST-BRIDGE-MARY | Restauradora | Puente Maryland | bridge | multi_tooth | — | both | pattern |
| REST-SPLINT-OCC | Restauradora | Férula de descarga | splint | global_arch | — | both | lateral |
| REST-SPLINT-PERIO | Restauradora | Férula periodontal de contención | splint | multi_tooth | — | both | lateral |
| REST-RECONSTR | Restauradora | Reconstrucción amplia con composite | filling_composite | tooth | M D O V L | both | surface |
| REST-FILL-REPAIR | Restauradora | Reparación de obturación | filling_composite | tooth | M D O V L | both | surface |
| REST-CROWN-RECEMENT | Restauradora | Recementado de corona | crown | tooth | — | both | pattern |
| REST-CROWN-POST-ENDO | Restauradora | Corona sobre diente endodonciado | crown | tooth | — | both | pattern |
| REST-HEAL-ABUT | Restauradora | Pilar de cicatrización | implant | tooth | — | both | lateral |
| REST-DEF-ABUT | Restauradora | Pilar definitivo | implant | tooth | — | both | lateral |
| ENDO-UNI | Endodoncia | Endodoncia unirradicular | root_canal_full | tooth | — | both | pulp |
| ENDO-BI | Endodoncia | Endodoncia birradicular | root_canal_full | tooth | — | both | pulp |
| ENDO-MULTI | Endodoncia | Endodoncia molar | root_canal_full | tooth | — | both | pulp |
| ENDO-RETREAT | Endodoncia | Retratamiento endodóncico | root_canal_full | tooth | — | both | pulp |
| ENDO-POST-FIBER | Endodoncia | Perno de fibra | post | tooth | — | both | lateral |
| ENDO-POST-METAL | Endodoncia | Perno colado | post | tooth | — | both | lateral |
| ENDO-URGENT | Endodoncia | Apertura cameral urgente | root_canal_half | tooth | — | both | pulp |
| ENDO-MED-REFRESH | Endodoncia | Recambio de medicación intraconducto | root_canal_two_thirds | tooth | — | both | pulp |
| ENDO-APICOFORM | Endodoncia | Apicoformación | root_canal_full | tooth | — | both | pulp |
| ENDO-PED | Endodoncia | Endodoncia en pieza temporal | root_canal_full | tooth | — | both | pulp |
| PERIO-SPLINT-RAR | Periodoncia | Férula de contención post-RAR | splint | multi_tooth | — | both | lateral |
| SURG-EXT-SIMPLE | Cirugía | Extracción simple | extraction | tooth | — | both | lateral |
| SURG-EXT-COMPLEX | Cirugía | Extracción compleja | extraction | tooth | — | both | lateral |
| SURG-EXT-3MOLAR | Cirugía | Extracción tercer molar | extraction | tooth | — | both | lateral |
| SURG-EXT-OST | Cirugía | Extracción quirúrgica con ostectomía | extraction | tooth | — | both | lateral |
| SURG-IMP-TI | Cirugía | Implante de titanio | implant | tooth | — | both | lateral |
| SURG-IMP-ZIR | Cirugía | Implante de zirconio | implant | tooth | — | both | lateral |
| SURG-APEC | Cirugía | Apicectomía | apicoectomy | tooth | — | both | lateral |
| SURG-CYST | Cirugía | Exéresis de quiste | apicoectomy | tooth | — | both | lateral |
| SURG-EXT-INCLUIDO | Cirugía | Extracción de pieza incluida | extraction | tooth | — | both | lateral |
| ORTO-BRACK | Ortodoncia | Bracket individual (reposición) | bracket | tooth | — | both | lateral |
| ORTO-RET-FIX | Ortodoncia | Retenedor fijo | retainer | tooth | — | both | lateral |
| ORTO-ATTACH | Ortodoncia | Ataches ortodóncicos | attachment | tooth | — | both | lateral |
| ORTO-BRACK-CEMENT | Ortodoncia | Cementado de bracket | bracket | tooth | — | both | lateral |
| PED-SEAL | Odontopediatría | Sellador pediátrico | sealant | tooth | M D O V L | both | surface |
| PED-PULPOTOMY | Odontopediatría | Pulpotomía | root_canal_half | tooth | — | both | pulp |
| PED-CROWN-SS | Odontopediatría | Corona preformada pediátrica | crown | tooth | — | both | pattern |
| PED-EXT-TEMP | Odontopediatría | Extracción de pieza temporal | extraction | tooth | — | both | lateral |
| PED-FILL-TEMP | Odontopediatría | Obturación en dentición temporal | filling_composite | tooth | M D O V L | both | surface |
| PED-PULPECTOMY | Odontopediatría | Pulpectomía pediátrica | root_canal_full | tooth | — | both | pulp |
| CORE-TUBE | Ortodoncia | Tubo ortodóncico | tube | tooth | — | both | lateral |
| CORE-BAND | Ortodoncia | Banda ortodóncica | band | tooth | — | both | lateral |
| CORE-ENDO-OVERFILL | Endodoncia | Obturación radicular sobreextendida | root_canal_overfill | tooth | — | both | pulp + lateral |

Coverage: 60 mapped seed variants plus three missing core tools; 63 therapeutic variants and twelve preserved findings. Variants sharing clinical type stay distinct. Clinical type pulp/root/surface rendering never substitutes for catalog scope: REST-SPLINT-OCC requires an explicit upper/lower arch; multi-tooth bridge/splint use atomic records and explicit member selection.

The rest of DentalPin's billable seed catalog, including uncharted/global-mouth services and prices, is excluded by D02. No template prices, appointment scheduling, branded treatment package names or implied financial acceptance are introduced. Core aliases filling/root_canal/bridge_pontic are reference legacy inputs, not extra target cards. Bridge member roles are selected inside the procedure, not separate pontic/abutment procedures.

Source: ../references/dentalpin/backend/app/modules/catalog/seed.py TREATMENTS mapped entries and ../references/dentalpin/backend/app/modules/odontogram/constants.py core type definitions, inspected 2026-10-06. Labels translated to plain Spanish where needed; anatomical illustrations are independently implemented.

## Recuento final contrastado con código

Lectura AST de `backend/app/modules/catalog/seed.py`, variable TREATMENTS:129 servicios en total,60 con odontogram_treatment_type y69 sin mapping. Los60 mapeados tienen22 tipos clínicos y scopes54 tooth,5 multi_tooth y1 global_arch. Todas sus internal_code aparecen en esta tabla; ninguna falta. CORE-TUBE, CORE-BAND y CORE-ENDO-OVERFILL completan tipos de las constantes sin variante seed. Resultado target:63 variantes +12 hallazgos =75 entradas, no75 tipos clínicos diferentes.

`useTreatmentCatalog.ts` sustituye las constantes de una categoría cuando tiene catálogo y usa fallback cuando no lo tiene; por ello la unión de75 es un contrato target de cobertura, no una afirmación de75 botones simultáneos en una clínica DentalPin. Los69 servicios sin mapping no se importan como herramientas dentales; incluyen prestaciones globales/comerciales fuera del scope aprobado.

`TreatmentBar.vue:370–449` detecta global_arch antes de la selección regular y abre picker superior/inferior. No forzar REST-SPLINT-OCC por la selección multi-tooth de su tipo splint. La fuente crea globales con status planned; el target permite registrar un aparato ya existente en Diagnóstico y uno futuro en Planificación con provenance adecuado: adaptación funcional explícita al alcance aprobado de observaciones/planes. Crear el planned record y su item en una sola transacción reemplaza las dos peticiones fuente sin añadir pasos de UI.

Each target variant resolves icon_key from the eight source internal-code overrides first, otherwise its clinical_type. visual-parity-contract.md defines motifs and the full source color pairs. Store/resolve palette and layer color roles separately; icon appearance never authorizes anatomical scope. The72 live source options were captured category by category; the75 target union remains unchanged.
