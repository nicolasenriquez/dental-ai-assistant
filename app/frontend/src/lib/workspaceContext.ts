export type WorkspaceSurface = 'patient_detail' | 'evolution_detail' | 'assistant';

export interface WorkspaceContext {
  surface: WorkspaceSurface;
  patientId?: string;
  evolutionId?: string;
}

export function workspaceContext(pathname: string): WorkspaceContext | null {
  const match = pathname.match(/^\/patients\/([^/]+)(?:\/evolutions\/([^/]+))?$/);
  if (match && match[2] !== 'new') {
    return {
      surface: match[2] ? 'evolution_detail' : 'patient_detail',
      patientId: match[1],
      evolutionId: match[2],
    };
  }
  return pathname === '/assistant' || pathname.startsWith('/a/') ? { surface: 'assistant' } : null;
}
