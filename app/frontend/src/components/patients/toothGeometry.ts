import type { Dentition, ToothSurface } from '../../lib/api';

export function fdiQuadrants(dentition: Dentition): number[] {
  return dentition === 'permanent' ? [1, 2, 4, 3] : [5, 6, 8, 7];
}
export function fdiTeeth(dentition: Dentition): number[] {
  const quadrants = fdiQuadrants(dentition);
  const count = dentition === 'permanent' ? 8 : 5;
  return quadrants.flatMap((q, index) =>
    Array.from({ length: count }, (_, i) => q * 10 + (index % 2 === 0 ? count - i : i + 1)),
  );
}
export function toothFamily(tooth: number): 'incisor' | 'canine' | 'premolar' | 'molar' {
  const position = tooth % 10;
  return position <= 2
    ? 'incisor'
    : position === 3
      ? 'canine'
      : tooth >= 50 || position >= 6
        ? 'molar'
        : 'premolar';
}
// Patient-domain drawings authored for this chart; no source SVG or clinical inference.
export const toothProfiles = {
  incisor: 'M9 6 Q21 2 33 6 L31 31 Q26 42 24 80 Q21 96 18 80 L12 34 Z',
  canine: 'M8 13 L21 3 L34 13 L31 34 Q27 45 24 86 Q21 98 18 84 L11 36 Z',
  premolar:
    'M5 10 Q10 2 21 8 Q32 2 37 10 L34 34 Q29 48 29 82 Q26 94 23 78 L21 47 L18 81 Q14 96 12 81 L8 35 Z',
  molar:
    'M3 12 Q8 3 15 9 Q21 3 27 9 Q35 3 39 12 L36 35 L33 84 Q29 98 26 78 L22 51 L18 83 Q13 97 10 81 L6 36 Z',
};
export const surfaceShapes: Record<ToothSurface, string> = {
  M: 'M5 99 L16 103 V111 L5 116 Z',
  D: 'M37 99 L26 103 V111 L37 116 Z',
  V: 'M5 99 H37 L26 103 H16 Z',
  L: 'M5 116 H37 L26 111 H16 Z',
  O: 'M16 103 H26 V111 H16 Z',
};
export function surfacePosition(surface: ToothSurface, tooth: number): ToothSurface {
  return [1, 4, 5, 8].includes(Math.floor(tooth / 10)) && (surface === 'M' || surface === 'D')
    ? surface === 'M'
      ? 'D'
      : 'M'
    : surface;
}
