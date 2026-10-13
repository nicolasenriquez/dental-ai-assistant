import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ClinicalRuntimeProvider } from '../ClinicalRuntimeProvider';
import { ClinicalComposer } from './ClinicalComposer';

const note = 'Nota de prueba con selección conservada.';

function Composer({
  mode,
  scope,
  value,
}: { mode: 'sheet' | 'panel'; scope: string; value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const Container = mode === 'sheet' ? 'section' : 'aside';
  return (
    <Container>
      <ClinicalComposer
        continuityKey={scope}
        origin={{ label: 'Paciente de prueba', retained: false }}
        value={value}
        textareaRef={ref}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        primaryAction="send"
        onPrimaryAction={vi.fn()}
        voice={{
          state: 'idle',
          elapsed: 0,
          error: null,
          canRetry: false,
          onStart: vi.fn(),
          onStop: vi.fn(),
          onCancel: vi.fn(),
          onRetry: vi.fn(),
        }}
      />
    </Container>
  );
}

function tree(mode: 'sheet' | 'panel', scope = 'thread::ctx:patient', value = note) {
  return (
    <MemoryRouter>
      <ClinicalRuntimeProvider>
        <button type="button">Otra acción</button>
        <Composer mode={mode} scope={scope} value={value} />
      </ClinicalRuntimeProvider>
    </MemoryRouter>
  );
}

describe('composer continuity across remounts', () => {
  it('preserves focus and backward selection in both composition directions', () => {
    const view = render(tree('sheet'));
    const input = screen.getByRole('textbox') as HTMLTextAreaElement;
    act(() => {
      input.focus();
      input.setSelectionRange(7, 18, 'backward');
    });
    for (const mode of ['panel', 'sheet'] as const) {
      view.rerender(tree(mode));
      const next = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(next).toHaveFocus();
      expect(next).toHaveValue(note);
      expect([next.selectionStart, next.selectionEnd, next.selectionDirection]).toEqual([
        7,
        18,
        'backward',
      ]);
    }
  });

  it.each(['other-thread::ctx:patient', 'thread::ctx:other-patient'])(
    'does not restore another context: %s',
    (scope) => {
      const view = render(tree('sheet'));
      act(() => (screen.getByRole('textbox') as HTMLTextAreaElement).focus());
      view.rerender(tree('panel', scope));
      expect(screen.getByRole('textbox')).not.toHaveFocus();
    },
  );

  it('does not steal focus after the user leaves the editor or restore changed text', () => {
    const view = render(tree('sheet'));
    act(() => (screen.getByRole('textbox') as HTMLTextAreaElement).focus());
    act(() => screen.getByRole('button', { name: 'Otra acción' }).focus());
    view.rerender(tree('panel'));
    expect(screen.getByRole('button', { name: 'Otra acción' })).toHaveFocus();
    act(() => (screen.getByRole('textbox') as HTMLTextAreaElement).focus());
    view.rerender(tree('sheet', 'thread::ctx:patient', 'Texto nuevo'));
    expect(screen.getByRole('textbox')).not.toHaveFocus();
    expect(screen.getByRole('textbox')).toHaveValue('Texto nuevo');
  });
});

it('returns focus after an explicit Stop, but respects a later focus choice', () => {
  const ref = { current: null } as React.RefObject<HTMLTextAreaElement>;
  const props = {
    origin: { label: null, retained: false },
    value: '',
    textareaRef: ref,
    onChange: vi.fn(),
    onSubmit: vi.fn(),
    onPrimaryAction: vi.fn(),
    voice: {
      state: 'idle' as const,
      elapsed: 0,
      error: null,
      canRetry: false,
      onStart: vi.fn(),
      onStop: vi.fn(),
      onCancel: vi.fn(),
      onRetry: vi.fn(),
    },
  };
  const view = render(<ClinicalComposer {...props} primaryAction="stop" />);
  const stop = screen.getByRole('button', { name: 'Detener respuesta actual' });
  act(() => stop.focus());
  fireEvent.click(stop);
  view.rerender(<ClinicalComposer {...props} primaryAction="send" />);
  expect(screen.getByRole('textbox')).toHaveFocus();
  view.rerender(<ClinicalComposer {...props} primaryAction="stop" />);
  fireEvent.click(screen.getByRole('button', { name: 'Detener respuesta actual' }));
  act(() => screen.getByRole('button', { name: 'Iniciar dictado' }).focus());
  view.rerender(<ClinicalComposer {...props} primaryAction="send" />);
  expect(screen.getByRole('button', { name: 'Iniciar dictado' })).toHaveFocus();
});
