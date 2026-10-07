import type {
  ConditionCatalog,
  ConditionCatalogEntry,
  Dentition,
  ToothSurface,
  TreatmentCatalog,
} from './api';

// Presentation only. Clinical labels and applicability always come from the server.
const symbols: Record<string, string> = Object.fromEntries(
  [
    'pulpitis',
    'caries',
    'incipient_caries',
    'pigmentation',
    'fracture',
    'missing',
    'periapical_lt_2mm',
    'periapical_2_4mm',
    'periapical_gt_4mm',
    'rotated',
    'displaced',
    'unerupted',
  ].map((code) => [code, code]),
);

export interface ResolvedCondition extends ConditionCatalogEntry {
  label: string;
  categoryLabel: string;
  category_key: string;
  allowed_dentitions: Dentition[];
  supported: boolean;
  symbol: string;
  symbolUnavailable: boolean;
}

const findingRoles: Record<string, string> = {
  pulpitis: 'finding',
  caries: 'finding',
  incipient_caries: 'incipient',
  pigmentation: 'pigmentation',
  fracture: 'fracture',
  missing: 'metal',
  periapical_lt_2mm: 'finding',
  periapical_2_4mm: 'extraction',
  periapical_gt_4mm: 'periapical-large',
  rotated: 'endodontics',
  displaced: 'crown',
  unerupted: 'unerupted',
};
export function findingPaletteRole(code: string): string {
  return findingRoles[code] ?? 'neutral';
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Catálogo inválido');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Catálogo inválido');
  return value;
}
export function normalizeConditionCatalog(value: unknown): ConditionCatalog {
  const raw = object(value);
  if (raw.version !== 1 || !Array.isArray(raw.conditions)) throw new Error('Catálogo inválido');
  const categories =
    raw.categories === undefined
      ? [{ key: 'diagnosis', label_es: 'Diagnóstico' }]
      : (() => {
          if (!Array.isArray(raw.categories)) throw new Error('Catálogo inválido');
          return raw.categories.map((value) => {
            const category = object(value);
            return { key: text(category.key), label_es: text(category.label_es) };
          });
        })();
  const conditions = raw.conditions.map((value): ConditionCatalogEntry => {
    const entry = object(value);
    const allowed =
      entry.allowed_dentitions === undefined ? ['permanent', 'primary'] : entry.allowed_dentitions;
    if (
      !Array.isArray(allowed) ||
      !allowed.length ||
      new Set(allowed).size !== allowed.length ||
      allowed.some((item) => item !== 'permanent' && item !== 'primary')
    )
      throw new Error('Dentición inválida');
    if (
      !Array.isArray(entry.surface_codes) ||
      new Set(entry.surface_codes).size !== entry.surface_codes.length ||
      entry.surface_codes.some((item) => !['M', 'D', 'O', 'V', 'L'].includes(item))
    )
      throw new Error('Superficies inválidas');
    return {
      code: text(entry.code),
      label_es: text(entry.label_es),
      category_key: entry.category_key === undefined ? 'diagnosis' : text(entry.category_key),
      allowed_dentitions: allowed as Dentition[],
      surface_codes: entry.surface_codes as ToothSurface[],
    };
  });
  if (
    new Set(conditions.map((entry) => entry.code)).size !== conditions.length ||
    new Set(categories.map((entry) => entry.key)).size !== categories.length
  )
    throw new Error('Catálogo repetido');
  return { version: 1, categories, conditions };
}
export function resolveCondition(
  catalog: ConditionCatalog | null | undefined,
  code: string,
): ResolvedCondition {
  const entry = catalog?.conditions.find((item) => item.code === code);
  const category = entry?.category_key ?? 'diagnosis';
  return {
    code,
    label_es: entry?.label_es ?? `Condición no reconocida · ${code}`,
    label: entry?.label_es ?? `Condición no reconocida · ${code}`,
    category_key: category,
    categoryLabel:
      catalog?.categories?.find((item) => item.key === category)?.label_es ??
      (category === 'diagnosis' ? 'Diagnóstico' : `Otra categoría · ${category}`),
    allowed_dentitions: entry?.allowed_dentitions ?? ['permanent', 'primary'],
    surface_codes: entry?.surface_codes ?? [],
    supported: !!entry,
    symbol: entry ? (symbols[code] ?? 'neutral') : 'neutral',
    symbolUnavailable: !entry || !symbols[code],
  };
}
export function conditionGroups(
  catalog: ConditionCatalog | null,
): { key: string; label: string; entries: ResolvedCondition[] }[] {
  const groups = new Map<string, { key: string; label: string; entries: ResolvedCondition[] }>();
  for (const item of catalog?.conditions ?? []) {
    const entry = resolveCondition(catalog, item.code);
    const group = groups.get(entry.category_key) ?? {
      key: entry.category_key,
      label: entry.categoryLabel,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(group.key, group);
  }
  return [...groups.values()];
}

export function dentalGroups(
  catalog: ConditionCatalog | null,
  treatments: TreatmentCatalog | null,
): ReturnType<typeof conditionGroups> {
  const findings = conditionGroups(catalog);
  return [
    ...findings,
    ...(treatments?.categories
      .filter((category) => category.key !== 'diagnosis')
      .map((category) => ({
        key: category.key,
        label: category.label_es,
        entries: treatments.variants
          .filter((variant) => variant.category_key === category.key)
          .map((variant) => ({
            code: variant.id,
            label_es: variant.label_es,
            label: variant.label_es,
            category_key: category.key,
            categoryLabel: category.label_es,
            allowed_dentitions: variant.allowed_dentitions,
            surface_codes: variant.surface_codes,
            supported: variant.enabled,
            symbol: variant.icon_key,
            symbolUnavailable: false,
          })),
      })) ?? []),
  ];
}
export function surfaceDescription(
  catalog: ConditionCatalog | null | undefined,
  code: string,
  surfaces: ToothSurface[],
): string {
  if (surfaces.length) return surfaces.join(', ');
  const entry = resolveCondition(catalog, code);
  return !entry.supported || entry.surface_codes.length
    ? 'Sin superficies especificadas'
    : 'Pieza completa, sin superficies';
}
