import { expect, it } from 'vitest';
import {
  normalizeConditionCatalog,
  resolveCondition,
  surfaceDescription,
} from './odontogramPresentation';

const legacy = {
  version: 1,
  conditions: [{ code: 'caries', label_es: 'Caries', surface_codes: ['M', 'D', 'O', 'V', 'L'] }],
};
it('normalizes legacy metadata without inventing clinical labels or required surfaces', () => {
  const catalog = normalizeConditionCatalog(legacy);
  expect(catalog.categories).toEqual([{ key: 'diagnosis', label_es: 'Diagnóstico' }]);
  expect(resolveCondition(catalog, 'caries')).toMatchObject({
    label: 'Caries',
    supported: true,
    symbol: 'caries',
    allowed_dentitions: ['permanent', 'primary'],
  });
  expect(surfaceDescription(catalog, 'caries', [])).toBe('Sin superficies especificadas');
});
it('accepts synthetic categories and neutral symbols while retaining unknown saved evidence', () => {
  const catalog = normalizeConditionCatalog({
    version: 1,
    categories: [{ key: 'synthetic', label_es: 'Grupo de prueba' }],
    conditions: [
      {
        code: 'synthetic',
        label_es: 'Hallazgo de prueba',
        category_key: 'synthetic',
        allowed_dentitions: ['primary'],
        surface_codes: [],
      },
    ],
  });
  expect(resolveCondition(catalog, 'synthetic')).toMatchObject({
    label: 'Hallazgo de prueba',
    categoryLabel: 'Grupo de prueba',
    symbol: 'neutral',
    symbolUnavailable: true,
    supported: true,
  });
  expect(surfaceDescription(catalog, 'synthetic', [])).toBe('Pieza completa, sin superficies');
  expect(resolveCondition(catalog, '<unknown>')).toMatchObject({
    label: 'Condición no reconocida · <unknown>',
    supported: false,
    symbol: 'neutral',
  });
  expect(surfaceDescription(null, '<unknown>', ['M'])).toBe('M');
});
it('rejects malformed applicability and gives missing category descriptors visible fallback', () => {
  for (const extra of [
    { allowed_dentitions: [] },
    { allowed_dentitions: ['mixed'] },
    { surface_codes: ['X'] },
    { surface_codes: ['M', 'M'] },
    { category_key: null },
  ]) {
    expect(() =>
      normalizeConditionCatalog({ ...legacy, conditions: [{ ...legacy.conditions[0], ...extra }] }),
    ).toThrow();
  }
  const catalog = normalizeConditionCatalog({
    ...legacy,
    conditions: [{ ...legacy.conditions[0], category_key: 'other' }],
  });
  expect(resolveCondition(catalog, 'caries').categoryLabel).toBe('Otra categoría · other');
});
