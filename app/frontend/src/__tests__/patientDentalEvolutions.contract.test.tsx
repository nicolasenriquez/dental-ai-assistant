import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');

describe('patient-first shell contract', () => {
  const app = read('../App.tsx');
  const sidebar = read('../components/Sidebar.tsx');
  const sidebarNavigation = read('../components/sidebar/SidebarNavigation.tsx');

  it('redirects root to patients and preserves chat routes', () => {
    expect(app).toContain('to="/patients"');
    expect(app).toContain('path="/patients"');
    expect(app).toContain('path="/chat"');
    expect(app).toContain('path="/c/:conversationId"');
    expect(sidebar).toContain("navigate('/chat')");
  });

  it('lists Pacientes before Chat and can hide conversations', () => {
    expect(sidebarNavigation.indexOf('>Pacientes</span>')).toBeGreaterThan(-1);
    expect(sidebarNavigation.indexOf('>Pacientes</span>')).toBeLessThan(
      sidebarNavigation.indexOf('>Chat</span>'),
    );
    expect(sidebar).toContain('showConversations');
  });
});

describe('patient pages and evolution workspace contracts', () => {
  const pages = () =>
    read('../pages/Patients.tsx') +
    read('../pages/PatientDetail.tsx') +
    read('../pages/NewEvolution.tsx') +
    read('../components/clinical/EvolutionReviewArtifact.tsx') +
    read('../components/clinical/evolutionFields.ts') +
    read('../components/PatientFormModal.tsx') +
    read('../components/PatientWorkspace.tsx') +
    read('../components/EvolutionDetailContent.tsx');

  it('covers one-field patient search and recoverable states', () => {
    const source = pages();
    for (const text of [
      'Buscar por nombre o RUT',
      'No encontramos pacientes',
      'Reintentar',
      'Abrir paciente',
    ]) {
      expect(source).toContain(text);
    }
  });

  it('keeps explicit generation, review flags and stale-save protection together', () => {
    const source = pages();
    for (const text of [
      'Nota clínica',
      'Borrador asistido',
      'Revisar y guardar',
      'Generar borrador con IA',
      'Generando borrador...',
      'Revisa estos puntos',
      'No encontramos información clínica suficiente para generar un borrador.',
      'No pudimos generar el borrador.',
      'Tu nota no se perdió.',
      'Editar nota',
      'Seguir editando',
      'Corregir nota y regenerar',
      'isDraftStale',
    ]) {
      expect(source).toContain(text);
    }
    expect(source).toContain('40000');
    expect(source).toContain('35000');
    expect(source).toContain('autoFocus');
    expect(source).not.toContain('onPaste={() => undefined}');
    expect(source).toContain('ctrlKey');
    expect(source).toContain('metaKey');
    expect(source).toContain('aria-live');
    expect(source).toContain('Cambiar fecha y hora');
    expect(source).toContain("workspace === 'reviewing'");
    expect(source).toContain('canSave');
    expect(source).toContain('Detalles de revisión');
    expect(source).toContain('data-state');
    expect(source).toContain('El borrador quedó desactualizado');
    expect(source).toContain('staleMessageId');
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
    expect(source).toContain('Evolución guardada');
    expect(source).toContain('savedEvolution.id');
    expect(source).toContain('generated_text');
    expect(source).toContain('final_text');
    expect(source).toContain('evolution_at');
    expect(source).toContain('saving');
    expect(source).toContain('toLocale');
    for (const label of [
      'Motivo / contexto',
      'Hallazgos',
      'Diagnóstico / impresión clínica',
      'Tratamiento / conducta',
      'Seguimiento',
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain('.filter');
    const workspace = read('../components/PatientWorkspace.tsx');
    const evolutionContent = read('../components/EvolutionDetailContent.tsx');
    expect(evolutionContent).not.toContain('Registro aprobado');
    expect(evolutionContent).toContain('Fecha de atención');
    expect(evolutionContent).toContain('dateTime={evolution.evolution_at}');
    expect(evolutionContent).toContain("normalize('NFD')");
    expect(evolutionContent).toContain("block.indexOf(':')");
    expect(workspace).toContain('Selecciona una evolución');
    expect(workspace).toContain("aria-current={selected ? 'page' : undefined}");
    expect(workspace).toContain('patient-workspace__detail');
  });
});
