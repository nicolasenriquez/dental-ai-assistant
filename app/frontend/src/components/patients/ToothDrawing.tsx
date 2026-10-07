import { useId } from 'react';
import type { ToothSurface } from '../../lib/api';
import {
  surfacePosition,
  surfaceShapes,
  toothAnatomy,
  toothDrawingTransforms,
  toothFamily,
  toothOcclusalProfile,
} from './toothGeometry';

export function ToothDrawing({
  tooth,
  surfaces = [],
  resolved = false,
  orientation = 'detail',
  hideRoot = false,
  attenuated = false,
  surfaceClassName = 'fill-primary/30 text-primary',
  view = 'both',
}: {
  tooth: number;
  surfaces?: ToothSurface[];
  resolved?: boolean;
  orientation?: 'upper' | 'lower' | 'detail';
  hideRoot?: boolean;
  attenuated?: boolean;
  surfaceClassName?: string;
  view?: 'both' | 'lateral' | 'occlusal';
}): JSX.Element {
  const clipId = `tooth-${useId().replace(/:/g, '')}`;
  const family = toothFamily(tooth);
  const anatomy = toothAnatomy(tooth);
  const transforms = toothDrawingTransforms(tooth, orientation);
  return (
    <g data-family={family} fill="none" stroke="currentColor" strokeWidth="1.2">
      <defs>
        <clipPath id={clipId}>
          <path d={toothOcclusalProfile(tooth)} />
        </clipPath>
      </defs>
      {view !== 'occlusal' && (
        <g
          opacity={attenuated ? 0.25 : 1}
          data-natural-root-hidden={hideRoot || undefined}
          transform={transforms.lateral}
        >
          <path
            data-profile
            data-profile-position={tooth >= 50 && tooth % 10 >= 4 ? (tooth % 10) + 2 : tooth % 10}
            d={hideRoot ? anatomy.crown : anatomy.path}
            className="dental-anatomy-root"
          />
          <path d={anatomy.crown} className="dental-anatomy-crown" />
          {!hideRoot && <path d={anatomy.pulp} className="dental-anatomy-pulp" strokeWidth=".6" />}
          <path d="M10 29 Q21 35 32 29 M13 13 Q21 19 29 13" className="text-muted" />
          {family === 'molar' && <path d="M15 11l3 13m9-13-3 13" className="text-muted" />}
        </g>
      )}
      {view !== 'lateral' && (
        <g opacity={attenuated ? 0.25 : 1} transform={transforms.occlusal}>
          <path
            data-occlusal-profile
            d={toothOcclusalProfile(tooth)}
            className="dental-anatomy-crown"
          />
          <g clipPath={`url(#${clipId})`}>
            {(['M', 'D', 'O', 'V', 'L'] as const).map((surface) => {
              const position = surfacePosition(surface, tooth);
              return (
                <path
                  key={surface}
                  data-surface={surface}
                  data-position={position === 'M' ? 'left' : position === 'D' ? 'right' : position}
                  d={surfaceShapes[position]}
                  className={
                    surfaces.includes(surface)
                      ? resolved
                        ? 'fill-surface text-muted'
                        : surfaceClassName
                      : 'text-border'
                  }
                  strokeDasharray={resolved && surfaces.includes(surface) ? '3 2' : undefined}
                />
              );
            })}
          </g>
          <path d={toothOcclusalProfile(tooth)} className="dental-outline" fill="none" />
        </g>
      )}
    </g>
  );
}
