import { describe, expect, it } from 'vitest';
import { insertTranscript } from './composerSelection';

describe('insertTranscript', () => {
  it('inserts at the captured caret', () => {
    expect(
      insertTranscript('El paciente presenta desde ayer', 'dolor intenso', {
        start: 20,
        end: 20,
        selectedText: '',
      }).value,
    ).toBe('El paciente presenta dolor intenso desde ayer');
  });

  it('appends instead of overwriting when the captured selection changed', () => {
    expect(
      insertTranscript('texto nuevo editado', 'dictado', {
        start: 0,
        end: 5,
        selectedText: 'original',
      }).value,
    ).toBe('texto nuevo editado dictado');
  });
});
