"""Fixed clinical inventory. No prices, scheduling or provider assets."""

from typing import Any

from backend.patients.conditions import CONDITION_DEFINITIONS, SURFACES

VERSION = "dental-clinical-v1"
CATEGORIES = (
    ("diagnosis", "Diagnóstico"),
    ("restorative", "Restauradora"),
    ("surgery", "Cirugía"),
    ("endodontics", "Endodoncia"),
    ("orthodontics", "Ortodoncia"),
    ("preventive", "Preventivo"),
    ("periodontics", "Periodoncia"),
    ("pediatric", "Odontopediatría"),
)
# ID | category | Spanish snapshot | clinical type | visual family | scope
_ROWS = """
PREV-SEAL|preventive|Sellador de fosas y fisuras|sealant|surface|tooth
REST-COMP|restorative|Obturación composite|filling_composite|surface|tooth
REST-AMAL|restorative|Obturación amalgama|filling_amalgam|surface|tooth
REST-TEMP|restorative|Obturación temporal|filling_temporary|surface|tooth
REST-INLAY-COMP|restorative|Incrustación de composite|inlay|pattern_surface|tooth
REST-INLAY-CER|restorative|Incrustación cerámica|inlay|pattern_surface|tooth
REST-OVER-COMP|restorative|Restauración de recubrimiento composite|overlay|pattern|tooth
REST-OVER-CER|restorative|Restauración de recubrimiento cerámico|overlay|pattern|tooth
REST-VEN-COMP|restorative|Carilla composite|veneer|surface|tooth
REST-VEN-PORC|restorative|Carilla porcelana|veneer|surface|tooth
REST-VEN-ZIR|restorative|Carilla zirconio|veneer|surface|tooth
REST-CROWN-MC|restorative|Corona metal-cerámica|crown|pattern|tooth
REST-CROWN-ZIR|restorative|Corona zirconio|crown|pattern|tooth
REST-CROWN-DISI|restorative|Corona disilicato de litio|crown|pattern|tooth
REST-CROWN-METAL|restorative|Corona metal|crown|pattern|tooth
REST-CROWN-PROV|restorative|Corona provisional|crown|pattern|tooth
REST-CROWN-IMPL-MC|restorative|Corona sobre implante metal-cerámica|crown_on_implant|pattern|tooth
REST-CROWN-IMPL-ZIR|restorative|Corona sobre implante zirconio|crown_on_implant|pattern|tooth
REST-CROWN-IMPL-PROV|restorative|Corona provisional sobre implante|provisional_crown_on_implant|pattern|tooth
REST-BRIDGE-MC|restorative|Puente metal-cerámica|bridge|pattern|multi_tooth
REST-BRIDGE-ZIR|restorative|Puente zirconio|bridge|pattern|multi_tooth
REST-BRIDGE-MARY|restorative|Puente Maryland|bridge|pattern|multi_tooth
REST-SPLINT-OCC|restorative|Férula de descarga|splint|lateral|global_arch
REST-SPLINT-PERIO|restorative|Férula periodontal de contención|splint|lateral|multi_tooth
REST-RECONSTR|restorative|Reconstrucción amplia con composite|filling_composite|surface|tooth
REST-FILL-REPAIR|restorative|Reparación de obturación|filling_composite|surface|tooth
REST-CROWN-RECEMENT|restorative|Recementado de corona|crown|pattern|tooth
REST-CROWN-POST-ENDO|restorative|Corona sobre diente endodonciado|crown|pattern|tooth
REST-HEAL-ABUT|restorative|Pilar de cicatrización|implant|lateral|tooth
REST-DEF-ABUT|restorative|Pilar definitivo|implant|lateral|tooth
ENDO-UNI|endodontics|Endodoncia unirradicular|root_canal_full|pulp|tooth
ENDO-BI|endodontics|Endodoncia birradicular|root_canal_full|pulp|tooth
ENDO-MULTI|endodontics|Endodoncia molar|root_canal_full|pulp|tooth
ENDO-RETREAT|endodontics|Retratamiento endodóncico|root_canal_full|pulp|tooth
ENDO-POST-FIBER|endodontics|Perno de fibra|post|lateral|tooth
ENDO-POST-METAL|endodontics|Perno colado|post|lateral|tooth
ENDO-URGENT|endodontics|Apertura cameral urgente|root_canal_half|pulp|tooth
ENDO-MED-REFRESH|endodontics|Recambio de medicación intraconducto|root_canal_two_thirds|pulp|tooth
ENDO-APICOFORM|endodontics|Apicoformación|root_canal_full|pulp|tooth
ENDO-PED|endodontics|Endodoncia en pieza temporal|root_canal_full|pulp|tooth
PERIO-SPLINT-RAR|periodontics|Férula de contención post-RAR|splint|lateral|multi_tooth
SURG-EXT-SIMPLE|surgery|Extracción simple|extraction|lateral|tooth
SURG-EXT-COMPLEX|surgery|Extracción compleja|extraction|lateral|tooth
SURG-EXT-3MOLAR|surgery|Extracción tercer molar|extraction|lateral|tooth
SURG-EXT-OST|surgery|Extracción quirúrgica con ostectomía|extraction|lateral|tooth
SURG-IMP-TI|surgery|Implante de titanio|implant|lateral|tooth
SURG-IMP-ZIR|surgery|Implante de zirconio|implant|lateral|tooth
SURG-APEC|surgery|Apicectomía|apicoectomy|lateral|tooth
SURG-CYST|surgery|Exéresis de quiste|apicoectomy|lateral|tooth
SURG-EXT-INCLUIDO|surgery|Extracción de pieza incluida|extraction|lateral|tooth
ORTO-BRACK|orthodontics|Bracket individual (reposición)|bracket|lateral|tooth
ORTO-RET-FIX|orthodontics|Retenedor fijo|retainer|lateral|tooth
ORTO-ATTACH|orthodontics|Ataches ortodóncicos|attachment|lateral|tooth
ORTO-BRACK-CEMENT|orthodontics|Cementado de bracket|bracket|lateral|tooth
PED-SEAL|pediatric|Sellador pediátrico|sealant|surface|tooth
PED-PULPOTOMY|pediatric|Pulpotomía|root_canal_half|pulp|tooth
PED-CROWN-SS|pediatric|Corona preformada pediátrica|crown|pattern|tooth
PED-EXT-TEMP|pediatric|Extracción de pieza temporal|extraction|lateral|tooth
PED-FILL-TEMP|pediatric|Obturación en dentición temporal|filling_composite|surface|tooth
PED-PULPECTOMY|pediatric|Pulpectomía pediátrica|root_canal_full|pulp|tooth
CORE-TUBE|orthodontics|Tubo ortodóncico|tube|lateral|tooth
CORE-BAND|orthodontics|Banda ortodóncica|band|lateral|tooth
CORE-ENDO-OVERFILL|endodontics|Obturación radicular sobreextendida|root_canal_overfill|pulp_lateral|tooth
"""
_OVERRIDES = {
    "REST-BRIDGE-MC": "bridge_metal_ceramic",
    "REST-BRIDGE-ZIR": "bridge_zirconia",
    "REST-BRIDGE-MARY": "bridge_maryland",
    "REST-SPLINT-OCC": "splint_occlusal",
    "REST-SPLINT-PERIO": "splint_periodontal",
}
_ROLES = {
    "filling_composite": "restoration",
    "filling_amalgam": "metal",
    "filling_temporary": "temporary",
    "sealant": "sealant",
    "veneer": "veneer",
    "inlay": "restoration",
    "overlay": "restoration",
    "crown": "crown",
    "crown_on_implant": "crown",
    "provisional_crown_on_implant": "provisional",
    "bridge": "crown",
    "splint": "restoration",
    "extraction": "extraction",
    "implant": "implant",
    "apicoectomy": "orthodontics",
    "post": "post",
    "root_canal_overfill": "restoration",
    "bracket": "orthodontics",
    "tube": "orthodontics",
    "band": "endodontics",
    "attachment": "veneer",
    "retainer": "retainer",
}


def _variant(row: str) -> dict[str, Any]:
    identifier, category, label, clinical_type, visual, scope = row.split("|")
    role = _ROLES.get(clinical_type, "endodontics")
    return {
        "id": identifier,
        "category_key": category,
        "label_es": label,
        "clinical_type": clinical_type,
        "scope": scope,
        "surface_codes": list(SURFACES) if "surface" in visual else [],
        "allowed_dentitions": ["permanent", "primary"],
        "visual_family": visual,
        "icon_key": _OVERRIDES.get(identifier, clinical_type),
        "palette_role": role,
        "layer_role": "restoration" if clinical_type.startswith("root_canal") else role,
        "enabled": scope == "tooth",
        "disabled_reason": None
        if scope == "tooth"
        else "La selección de varias piezas o arcada estará disponible en la siguiente etapa.",
    }


VARIANTS = {v["id"]: v for v in (_variant(row) for row in _ROWS.strip().splitlines())}


def catalog() -> dict[str, Any]:
    return {
        "version": VERSION,
        "categories": [{"key": k, "label_es": v} for k, v in CATEGORIES],
        "variants": list(VARIANTS.values()),
        "findings": [
            {
                "code": code,
                "label_es": entry.label_es,
                "category_key": entry.category_key,
                "surface_codes": list(entry.surface_codes),
                "allowed_dentitions": list(entry.allowed_dentitions),
                "clinical_type": code,
                "scope": "tooth",
                "visual_family": "surface" if entry.surface_codes else "lateral",
                "icon_key": code,
                "palette_role": "diagnosis",
                "layer_role": "diagnosis",
            }
            for code, entry in CONDITION_DEFINITIONS.items()
        ],
    }
