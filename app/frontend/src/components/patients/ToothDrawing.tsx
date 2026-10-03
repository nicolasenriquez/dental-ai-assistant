import type { ToothSurface } from '../../lib/api';
import { surfacePosition, surfaceShapes, toothFamily, toothProfiles } from './toothGeometry';

export function ToothDrawing({
  tooth,
  surfaces = [],
  resolved = false,
  orientation = 'detail',
}: {
  tooth: number;
  surfaces?: ToothSurface[];
  resolved?: boolean;
  orientation?: 'upper' | 'lower' | 'detail';
}): JSX.Element {
  const family = toothFamily(tooth);
  return (
    <g data-family={family} fill="none" stroke="currentColor" strokeWidth="1.2">
      <g transform={orientation === 'upper' ? 'translate(0 94) scale(1 -1)' : undefined}>
        <path data-profile d={toothProfiles[family]} className="fill-surface text-muted" />
        <path d="M10 29 Q21 35 32 29 M13 13 Q21 19 29 13" className="text-muted" />
        {family === 'molar' && <path d="M15 11l3 13m9-13-3 13" className="text-muted" />}
      </g>
      <g transform={orientation === 'lower' ? 'translate(0 -122)' : undefined}>
        {family === 'incisor' ? (
          <rect x="5" y="99" width="32" height="17" rx="4" className="fill-surface text-muted" />
        ) : family === 'canine' ? (
          <path d="M21 96l17 12-17 12L4 108Z" className="fill-surface text-muted" />
        ) : (
          <rect x="4" y="97" width="34" height="22" rx="7" className="fill-surface text-muted" />
        )}
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
                    : 'fill-primary/30 text-primary'
                  : 'text-border'
              }
              strokeDasharray={resolved && surfaces.includes(surface) ? '3 2' : undefined}
            />
          );
        })}
      </g>
    </g>
  );
}
