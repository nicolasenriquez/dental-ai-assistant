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

// Eight independently drawn permanent positions. Primary molars map to positions 6/7.
// Anchors belong to each silhouette; clinical symbols never infer a persisted finding.
export const anatomicalProfiles = [
  {
    path: 'M9 5 Q21 2 33 5 L31 32 Q25 53 23 88 Q21 99 19 88 L12 33 Z',
    crown: 'M9 5 Q21 2 33 5 L31 32 Q21 36 12 33 Z',
    pulp: 'M17 12 Q21 8 25 12 L23 32 L21 88 L19 32 Z',
    apex: [21, 88],
    crownCenter: [21, 20],
    scale: 0.65,
  },
  {
    path: 'M11 7 Q21 3 31 7 L29 31 Q24 46 23 85 Q21 97 19 85 L14 32 Z',
    crown: 'M11 7 Q21 3 31 7 L29 31 Q21 35 14 32 Z',
    pulp: 'M18 13 Q21 10 24 13 L23 32 L21 85 L19 32 Z',
    apex: [21, 85],
    crownCenter: [21, 20],
    scale: 0.62,
  },
  {
    path: 'M9 13 L21 3 L33 13 L30 34 Q26 50 23 91 Q21 101 19 91 L12 35 Z',
    crown: 'M9 13 L21 3 L33 13 L30 34 Q21 38 12 35 Z',
    pulp: 'M18 16 L21 10 L24 16 L23 35 L21 91 L19 35 Z',
    apex: [21, 91],
    crownCenter: [21, 23],
    scale: 0.62,
  },
  {
    path: 'M7 9 Q13 2 21 9 Q30 2 35 10 L32 34 Q29 53 28 85 Q25 96 23 80 L21 46 L18 83 Q14 96 12 82 L10 35 Z',
    crown: 'M7 9 Q13 2 21 9 Q30 2 35 10 L32 34 Q21 39 10 35 Z',
    pulp: 'M15 13 Q21 18 27 13 L25 33 L21 40 L17 80 L18 37 Z M23 37 L26 82 L24 37 Z',
    apex: [14, 83],
    crownCenter: [21, 22],
    scale: 0.62,
  },
  {
    path: 'M6 11 Q14 3 21 8 Q28 4 36 11 L33 33 Q28 42 27 82 Q24 95 22 82 L20 43 L17 85 Q13 95 12 82 L9 34 Z',
    crown: 'M6 11 Q14 3 21 8 Q28 4 36 11 L33 33 Q21 38 9 34 Z',
    pulp: 'M14 13 L21 17 L28 13 L25 33 L21 42 L15 84 L17 34 Z M23 34 L25 82 L24 34 Z',
    apex: [15, 84],
    crownCenter: [21, 22],
    scale: 0.62,
  },
  {
    path: 'M3 12 Q8 3 15 9 Q21 4 27 9 Q35 3 39 12 L36 33 L33 83 Q29 96 26 80 L22 49 L18 84 Q13 96 10 81 L6 34 Z',
    crown: 'M3 12 Q8 3 15 9 Q21 4 27 9 Q35 3 39 12 L36 33 Q21 39 6 34 Z',
    pulp: 'M11 15 Q21 21 31 15 L28 31 L22 39 L14 83 L15 36 Z M25 35 L30 82 L27 35 Z',
    apex: [14, 83],
    crownCenter: [21, 24],
    scale: 0.95,
  },
  {
    path: 'M4 11 Q10 4 16 10 Q23 3 29 10 Q35 5 38 13 L35 35 L32 81 Q28 95 25 80 L22 50 L18 82 Q13 95 10 80 L7 35 Z',
    crown: 'M4 11 Q10 4 16 10 Q23 3 29 10 Q35 5 38 13 L35 35 Q21 40 7 35 Z',
    pulp: 'M12 16 Q21 22 30 16 L27 33 L22 42 L14 81 L16 36 Z M25 36 L29 80 L26 36 Z',
    apex: [14, 81],
    crownCenter: [21, 25],
    scale: 1,
  },
  {
    path: 'M5 14 Q9 6 16 12 Q23 6 29 11 Q35 8 37 16 L34 36 Q31 51 29 77 Q25 92 23 77 L21 49 L17 79 Q12 91 11 77 L8 36 Z',
    crown: 'M5 14 Q9 6 16 12 Q23 6 29 11 Q35 8 37 16 L34 36 Q21 40 8 36 Z',
    pulp: 'M13 19 Q21 23 29 18 L26 35 L21 44 L15 78 L17 37 Z M24 37 L27 77 L25 37 Z',
    apex: [15, 78],
    crownCenter: [21, 26],
    scale: 1.2,
  },
] as const;

export function toothAnatomy(tooth: number): (typeof anatomicalProfiles)[number] {
  const position = tooth % 10;
  const mapped = tooth >= 50 && position >= 4 ? position + 2 : position;
  return anatomicalProfiles[Math.max(0, Math.min(7, mapped - 1))];
}
export const surfaceShapes: Record<ToothSurface, string> = {
  M: 'M5 99 L16 103 V111 L5 116 Z',
  D: 'M37 99 L26 103 V111 L37 116 Z',
  V: 'M5 99 H37 L26 103 H16 Z',
  L: 'M5 116 H37 L26 111 H16 Z',
  O: 'M16 103 H26 V111 H16 Z',
};

const occlusalProfiles = [
  'M9 98H33Q38 98 38 103V112Q38 117 33 117H9Q4 117 4 112V103Q4 98 9 98Z',
  'M10 99H32Q37 99 37 104V111Q37 116 32 116H10Q5 116 5 111V104Q5 99 10 99Z',
  'M21 96Q29 98 38 108Q29 117 21 120Q12 117 4 108Q12 98 21 96Z',
  'M12 97Q21 94 31 98Q38 101 38 108Q36 118 26 120Q14 120 5 114Q1 103 12 97Z',
  'M11 98Q21 94 32 98Q39 103 37 113Q32 121 21 120Q7 119 4 111Q2 103 11 98Z',
  'M11 96Q21 93 31 97Q40 98 40 107Q39 118 29 120Q15 122 5 115Q1 102 11 96Z',
  'M10 97Q21 94 32 98Q40 102 38 113Q33 121 22 120Q8 122 4 112Q2 102 10 97Z',
  'M12 98Q21 95 31 100Q38 102 37 113Q30 122 20 119Q7 120 5 110Q3 102 12 98Z',
] as const;

export function toothOcclusalProfile(tooth: number): string {
  const position = tooth >= 50 && tooth % 10 >= 4 ? (tooth % 10) + 2 : tooth % 10;
  return occlusalProfiles[Math.max(0, Math.min(7, position - 1))];
}
export function surfacePosition(surface: ToothSurface, tooth: number): ToothSurface {
  return [1, 4, 5, 8].includes(Math.floor(tooth / 10)) && (surface === 'M' || surface === 'D')
    ? surface === 'M'
      ? 'D'
      : 'M'
    : surface;
}

export function toothDrawingTransforms(
  tooth: number,
  orientation: 'upper' | 'lower' | 'detail',
): { lateral: string; occlusal: string } {
  if (orientation === 'detail') return { lateral: '', occlusal: '' };
  const widthScale = (55 * toothAnatomy(tooth).scale) / 42;
  const mirror = [2, 3, 6, 7].includes(Math.floor(tooth / 10)) ? 'translate(42 0) scale(-1 1)' : '';
  // Reserve 110px for lateral anatomy, with a separate occlusal row and readable FDI labels.
  return {
    lateral: `translate(21 ${orientation === 'upper' ? 110 : 0}) scale(${widthScale} ${orientation === 'upper' ? -110 / 94 : 110 / 94}) translate(-21 0) ${mirror}`,
    occlusal: `translate(21 ${orientation === 'upper' ? 19 : -141}) scale(${widthScale} 1) translate(-21 0)`,
  };
}
