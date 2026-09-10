import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClinicalDraft } from '../../lib/api';
import { EvolutionReviewArtifact } from './EvolutionReviewArtifact';

const draft: ClinicalDraft = {
  context: 'Control preventivo.',
  findings: 'Sin hallazgos nuevos.',
  assessment: 'Salud periodontal estable.',
  treatment: 'Mantener higiene.',
  follow_up: 'Control en seis meses.',
  review_flags: [],
};

afterEach(cleanup);

function renderArtifact(onChange = vi.fn()) {
  return {
    onChange,
    ...render(
      <EvolutionReviewArtifact
        mode="manual"
        sourceNote="Nota original"
        draft={draft}
        generatedDraft={draft}
        evolutionAt="2026-09-08T23:23:00-04:00"
        stale={false}
        edited={false}
        onChange={onChange}
      />,
    ),
  };
}

describe('EvolutionReviewArtifact', () => {
  it.each([
    [false, false, 'Borrador'],
    [false, true, 'Borrador'],
    [true, true, 'Necesita regeneración'],
  ])(
    'shows assistant provenance and lifecycle for stale=%s edited=%s',
    (stale, edited, lifecycle) => {
      render(
        <EvolutionReviewArtifact
          mode="assistant"
          sourceNote="Nota original"
          draft={draft}
          generatedDraft={draft}
          evolutionAt="2026-09-08T23:23:00-04:00"
          stale={stale}
          edited={edited}
          onChange={vi.fn()}
          onRegenerate={vi.fn()}
          onPrepare={vi.fn()}
        />,
      );
      expect(screen.getByText(lifecycle)).toBeVisible();
    },
  );

  it('prepares an assistant draft without claiming to save it', () => {
    const onPrepare = vi.fn();
    render(
      <EvolutionReviewArtifact
        mode="assistant"
        sourceNote="Nota original"
        draft={draft}
        generatedDraft={draft}
        evolutionAt="2026-09-08T23:23:00-04:00"
        stale={false}
        edited={false}
        onChange={vi.fn()}
        onPrepare={onPrepare}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preparar para guardar' }));
    expect(onPrepare).toHaveBeenCalledOnce();
  });

  it('starts in read mode and edits one field on demand', () => {
    renderArtifact();

    expect(screen.queryByRole('textbox', { name: 'Hallazgos' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Editar / })).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: 'Editar Hallazgos' }));
    expect(screen.getByRole('textbox', { name: 'Hallazgos' })).toHaveValue('Sin hallazgos nuevos.');
    expect(screen.queryByRole('textbox', { name: 'Motivo / contexto' })).not.toBeInTheDocument();
  });

  it('applies edits and restores the original value on cancel', () => {
    const onChange = vi.fn();
    renderArtifact(onChange);

    fireEvent.click(screen.getByRole('button', { name: 'Editar Hallazgos' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Hallazgos' }), {
      target: { value: 'Encías sin sangrado.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(onChange).toHaveBeenCalledWith({ ...draft, findings: 'Encías sin sangrado.' });

    fireEvent.click(screen.getByRole('button', { name: 'Editar Hallazgos' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Hallazgos' }), {
      target: { value: 'Cambio descartado.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('textbox', { name: 'Hallazgos' })).not.toBeInTheDocument();
  });

  it('blocks saving until the active field edit is applied', () => {
    render(
      <EvolutionReviewArtifact
        mode="manual"
        sourceNote="Nota original"
        draft={draft}
        generatedDraft={draft}
        evolutionAt="2026-09-08T23:23:00-04:00"
        stale={false}
        edited={false}
        canSave
        onChange={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    const save = screen.getByRole('button', { name: 'Guardar evolución' });
    expect(save).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Editar Hallazgos' }));
    expect(save).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(save).toBeEnabled();
  });

  it('does not expose editing controls in read-only mode', () => {
    render(
      <EvolutionReviewArtifact
        mode="assistant"
        sourceNote="Nota original"
        draft={draft}
        generatedDraft={draft}
        evolutionAt="2026-09-08T23:23:00-04:00"
        stale={false}
        edited={false}
        readOnly
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /^Editar / })).not.toBeInTheDocument();
  });

  it('buffers source edits, cancels locally, and applies once', async () => {
    const onSourceChange = vi.fn().mockResolvedValue(true);
    render(
      <EvolutionReviewArtifact
        mode="assistant"
        sourceNote="Nota original"
        draft={draft}
        generatedDraft={draft}
        evolutionAt="2026-09-08T23:23:00-04:00"
        stale={false}
        edited={false}
        sourceEditable
        onChange={vi.fn()}
        onSourceChange={onSourceChange}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Ver nota clínica original' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar nota original' }));
    const source = screen.getByRole('textbox', { name: 'Editar nota clínica original' });
    fireEvent.change(source, { target: { value: 'Cambio local' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onSourceChange).not.toHaveBeenCalled();
    expect(screen.getByText('Nota original')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Editar nota original' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Editar nota clínica original' }), {
      target: { value: 'Cambio aplicado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(onSourceChange).toHaveBeenCalledOnce());
    expect(onSourceChange).toHaveBeenCalledWith('Cambio aplicado');
  });

  it('keeps source text and offers retry when persistence fails', async () => {
    const onSourceChange = vi.fn().mockResolvedValue(false);
    render(
      <EvolutionReviewArtifact
        mode="assistant"
        sourceNote="Nota original"
        draft={draft}
        generatedDraft={draft}
        evolutionAt="2026-09-08T23:23:00-04:00"
        stale={false}
        edited={false}
        sourceEditable
        onChange={vi.fn()}
        onSourceChange={onSourceChange}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ver nota clínica original' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar nota original' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Editar nota clínica original' }), {
      target: { value: 'Texto conservado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu texto sigue aquí');
    expect(screen.getByRole('textbox', { name: 'Editar nota clínica original' })).toHaveValue(
      'Texto conservado',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(onSourceChange).toHaveBeenCalledTimes(2));
  });
});
