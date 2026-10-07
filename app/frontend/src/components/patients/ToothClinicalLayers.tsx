import { useId } from 'react';
import type {
  PatientCondition,
  PatientTreatment,
  ToothSurface,
  TreatmentCatalog,
} from '../../lib/api';
import { findingPaletteRole } from '../../lib/odontogramPresentation';
import {
  surfacePosition,
  surfaceShapes,
  toothAnatomy,
  toothDrawingTransforms,
  toothOcclusalProfile,
} from './toothGeometry';

interface ToothClinicalLayersProps {
  tooth: number;
  upper: boolean;
  conditions: PatientCondition[];
  treatments: PatientTreatment[];
  catalog?: TreatmentCatalog | null;
  preview?: string | null;
}

// Anatomy, pulp, surface and lateral marks remain separate; history identity stays on every layer.
export function ToothClinicalLayers({
  tooth,
  upper,
  conditions,
  treatments,
  catalog,
  preview,
}: ToothClinicalLayersProps): JSX.Element {
  const id = useId().replace(/:/g, '');
  const anatomy = toothAnatomy(tooth);
  const transforms = toothDrawingTransforms(tooth, upper ? 'upper' : 'lower');
  const rows = [
    ...conditions
      .filter((r) => r.status === 'active')
      .map((r) => ({
        id: r.id,
        key: r.condition_code,
        role: findingPaletteRole(r.condition_code),
        surfaces: r.surfaces,
        planned: false,
        preview: false,
      })),
    ...treatments
      .filter((r) => r.state !== 'entered_in_error' && r.state !== 'cancelled')
      .map((r) => {
        const variant = catalog?.variants.find((v) => v.id === r.variant_id);
        return {
          id: r.id,
          key: variant?.icon_key ?? r.clinical_type,
          role: variant?.layer_role ?? r.clinical_type,
          surfaces: r.teeth.find((m) => m.tooth_fdi === tooth)?.surfaces ?? [],
          planned: r.state === 'planned',
          preview: false,
        };
      }),
  ];
  const previewVariant = catalog?.variants.find((variant) => variant.id === preview);
  if (preview) {
    rows.push({
      id: 'preview',
      key: previewVariant?.icon_key ?? preview,
      role: previewVariant?.layer_role ?? findingPaletteRole(preview),
      surfaces: [],
      planned: false,
      preview: true,
    });
  }
  const centers: Record<ToothSurface, [number, number]> = {
    M: [10, 108],
    D: [32, 108],
    O: [21, 107],
    V: [21, 100],
    L: [21, 114],
  };
  return (
    <g pointerEvents="none">
      <defs>
        <clipPath id={`${id}-occlusal`}>
          <path d={toothOcclusalProfile(tooth)} />
        </clipPath>
        <clipPath id={`${id}-pulp`}>
          <path d={anatomy.pulp} />
        </clipPath>
        <clipPath id={`${id}-crown`}>
          <path d={anatomy.crown} />
        </clipPath>
        <pattern id={`${id}-stripe`} patternUnits="userSpaceOnUse" width="5" height="5">
          <path d="M-1 1 1-1 M0 5 5 0 M4 6 6 4" stroke="currentColor" strokeWidth="1" />
        </pattern>
        <pattern id={`${id}-dot`} patternUnits="userSpaceOnUse" width="5" height="5">
          <circle cx="2" cy="2" r=".8" fill="currentColor" />
        </pattern>
        <pattern id={`${id}-line`} patternUnits="userSpaceOnUse" width="5" height="5">
          <path d="M0 2h5" stroke="currentColor" />
        </pattern>
      </defs>
      {rows.map((row) => (
        <g
          key={row.id}
          data-clinical-layer={row.preview ? undefined : row.id}
          data-preview-tool={row.preview ? preview : undefined}
          className={`dental-${row.role}${row.preview ? ' dental-preview' : ''}`}
          opacity={row.planned ? 0.7 : 1}
        >
          <g transform={transforms.lateral}>
            {(row.key.startsWith('root_canal') || row.key === 'pulpitis') && (
              <rect
                data-pulp-level={row.key}
                x="0"
                y={row.key.endsWith('half') ? 33 : row.key.endsWith('two_thirds') ? 19 : 0}
                width="42"
                height={row.key.endsWith('half') ? 47 : row.key.endsWith('two_thirds') ? 66 : 94}
                clipPath={`url(#${id}-pulp)`}
                fill="currentColor"
                className="dental-pulp-fill"
              />
            )}
            {(row.key.includes('crown') ||
              row.key.startsWith('bridge') ||
              ['inlay', 'overlay', 'unerupted'].includes(row.key)) && (
              <path
                data-crown-pattern={row.key}
                d={anatomy.crown}
                fill={
                  row.key.includes('implant') || row.key.startsWith('bridge')
                    ? 'currentColor'
                    : `url(#${id}-${row.key === 'inlay' ? 'dot' : row.key === 'overlay' ? 'line' : 'stripe'})`
                }
                fillOpacity={row.key.startsWith('provisional') ? 0.2 : 0.65}
                stroke="currentColor"
              />
            )}
            {row.key.includes('implant') && (
              <path
                d="M18 36h6v48h-6Zm-3 8h12m-12 8h12m-11 8h10m-10 8h10m-9 8h8"
                fill="currentColor"
                fillOpacity=".3"
                stroke="currentColor"
              />
            )}
            {row.key === 'missing' || row.key === 'extraction' ? (
              <path d="M8 5 34 38M34 5 8 38" stroke="currentColor" strokeWidth="2.5" />
            ) : null}
            {row.key === 'fracture' && (
              <path d="m24 4-8 13 10 5-9 16" stroke="currentColor" strokeWidth="2" />
            )}
            {row.key.startsWith('periapical') && (
              <circle
                cx={anatomy.apex[0]}
                cy={anatomy.apex[1]}
                r={row.key.includes('lt') ? 3 : row.key.includes('gt') ? 8 : 5}
                fill="currentColor"
                fillOpacity=".45"
                stroke="currentColor"
              />
            )}
            {row.key === 'root_canal_overfill' && (
              <circle cx={anatomy.apex[0]} cy={anatomy.apex[1] + 5} r="3" fill="currentColor" />
            )}
            {row.key === 'post' && <path d="M19 16h4v17l-2 40-2-40Z" fill="currentColor" />}
            {['bracket', 'tube', 'band', 'attachment', 'retainer'].includes(row.key) && (
              <g transform={`translate(${anatomy.crownCenter[0]} ${anatomy.crownCenter[1]})`}>
                <path
                  d={
                    row.key === 'attachment'
                      ? 'M-5-5h10v10H-5Z'
                      : row.key === 'retainer'
                        ? 'M-16 0h32m-24-5v10m16-10v10'
                        : row.key === 'band'
                          ? 'M-14-7h28v14h-28Z'
                          : row.key === 'tube'
                            ? 'M-8-3h16v6H-8Z M-14 0h28'
                            : 'M-7-6H7v12H-7Z M-13 0h26m-16-4v8m6-8v8'
                  }
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </g>
            )}
            {row.key === 'rotated' && (
              <path d="M8 12a14 14 0 0 1 25 0m-6-6 6 6 2-8" stroke="currentColor" fill="none" />
            )}
            {row.key === 'displaced' && (
              <path d="M5 20h32m-6-5 6 5-6 5" stroke="currentColor" fill="none" />
            )}
            {row.key === 'apicoectomy' && (
              <path d="M8 80h26" stroke="currentColor" strokeWidth="3" />
            )}
          </g>
          <g transform={transforms.occlusal} clipPath={`url(#${id}-occlusal)`}>
            {row.preview &&
              (previewVariant?.visual_family === 'surface' ||
                [
                  'caries',
                  'incipient_caries',
                  'pigmentation',
                  'filling_composite',
                  'filling_amalgam',
                  'filling_temporary',
                  'sealant',
                  'veneer',
                ].includes(row.key)) && (
                <path
                  d={toothOcclusalProfile(tooth)}
                  fill="currentColor"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              )}
            {row.surfaces.map((surface) => {
              const position = surfacePosition(surface, tooth);
              const center = centers[position];
              return row.key === 'incipient_caries' || row.key === 'pigmentation' ? (
                <circle key={surface} cx={center[0]} cy={center[1]} r="2" fill="currentColor" />
              ) : (
                <path
                  key={surface}
                  d={surfaceShapes[position]}
                  fill={row.key === 'sealant' ? 'none' : 'currentColor'}
                  fillOpacity=".65"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              );
            })}
          </g>
        </g>
      ))}
      <g
        transform={transforms.occlusal}
        fill="none"
        className="stroke-border"
        clipPath={`url(#${id}-occlusal)`}
      >
        {Object.values(surfaceShapes).map((path) => (
          <path key={path} d={path} strokeWidth=".6" />
        ))}
      </g>
      <path
        d={toothOcclusalProfile(tooth)}
        transform={transforms.occlusal}
        className="dental-outline"
        fill="none"
        strokeWidth="1.2"
      />
    </g>
  );
}
