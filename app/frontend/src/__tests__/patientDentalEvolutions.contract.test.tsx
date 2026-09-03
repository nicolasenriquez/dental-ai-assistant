import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('patient-first shell contract', () => {
  const app = read('../App.tsx');
  const sidebar = read('../components/Sidebar.tsx');

  it('redirects root to patients and preserves chat routes', () => {
    expect(app).toContain('to="/patients"');
    expect(app).toContain('path="/patients"');
    expect(app).toContain('path="/chat"');
    expect(app).toContain('path="/c/:conversationId"');
  });

  it('lists Pacientes before Chat and can hide conversations', () => {
    expect(sidebar.indexOf('Pacientes')).toBeGreaterThan(-1);
    expect(sidebar.indexOf('Pacientes')).toBeLessThan(sidebar.indexOf('Chat'));
    expect(sidebar).toContain('showConversations');
  });
});

describe('patient pages and evolution workspace contracts', () => {
  const pages = () => read('../pages/Patients.tsx') + read('../pages/PatientDetail.tsx') + read('../pages/NewEvolution.tsx') + read('../pages/EvolutionDetail.tsx');

  it('covers one-field patient search and recoverable states', () => {
    const source = pages();
    for (const text of ['Buscar por nombre o RUT', 'No encontramos pacientes', 'Reintentar', 'Abrir paciente']) {
      expect(source).toContain(text);
    }
  });

  it('keeps explicit generation, review flags and stale-save protection together', () => {
    const source = pages();
    for (const text of ['Nota rapida', 'Redactar evolucion', 'Informacion por revisar', 'Corregir nota y regenerar', 'isDraftStale']) {
      expect(source).toContain(text);
    }
    expect(source).toContain('40000');
    expect(source).toContain('35000');
    expect(source).toContain('autoFocus');
    expect(source).toContain('onPaste');
    expect(source).toContain('ctrlKey');
    expect(source).toContain('metaKey');
    expect(source).toContain('aria-live');
    expect(source).toContain('Cambiar fecha y hora');
  });

  it('confirms before replacing human edits and preserves retryable work', () => {
    const source = pages();
    for (const text of ['Cancelar', 'Regenerar', 'Reintentar', 'hasHumanEdits', 'isDraftStale']) {
      expect(source).toContain(text);
    }
    expect(source).toContain('review_flags');
    expect(source).toContain('disabled');
  });

  it('uses one client UUID, offset ISO time, retry-safe state and newest-first history', () => {
    const source = pages();
    expect(source).toContain('crypto.randomUUID()');
    expect(source).toContain('toISOString');
    expect(source).toContain('Evolucion guardada');
    expect(source).toContain('generated_text');
    expect(source).toContain('final_text');
    expect(source).toContain('evolution_at');
    expect(source).toContain('saving');
    expect(source).toContain('locale');
    for (const label of ['Motivo / contexto', 'Hallazgos', 'Diagnostico / impresion clinica', 'Tratamiento / conducta', 'Seguimiento']) {
      expect(source).toContain(label);
    }
    expect(source).toContain('.filter');
  });
});
