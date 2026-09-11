/**
 * Fail-first contract tests for the Drive document model (task 5.1).
 *
 * Seam for task 5.2: `src/lib/driveDocument.ts` must export
 *
 *   type AuthoringRepresentation = 'local_markdown' | 'persisted_plain_text';
 *   serializeToPlainText(content, representation): string
 *   normalizeDriveFileName(name): string
 *   isDriveDocumentDirty(state): boolean
 *
 * where `state = { localAuthoringContent, authoringRepresentation,
 * persistedPlainTextBaseline: string | null }`.
 *
 * The fixture corpus below is shared with the backend Picker conversion
 * (`tests/test_google_drive_text_export.py`): frontend local export and
 * backend import produce byte-identical plain text.
 */

import { beforeAll, describe, expect, it } from 'vitest';

type DriveDocumentSeam = {
  isDriveDocumentDirty: (state: {
    localAuthoringContent: string;
    authoringRepresentation: 'local_markdown' | 'persisted_plain_text';
    persistedPlainTextBaseline: string | null;
  }) => boolean;
  normalizeDriveFileName: (name: string) => string;
  serializeToPlainText: (
    content: string,
    representation: 'local_markdown' | 'persisted_plain_text',
  ) => string;
};

let driveDocument: DriveDocumentSeam | null = null;

beforeAll(async () => {
  try {
    driveDocument = await import('../lib/driveDocument');
  } catch {
    driveDocument = null;
  }
});

function seam(): DriveDocumentSeam {
  if (!driveDocument) {
    throw new Error('missing src/lib/driveDocument.ts seam — implement in task 5.2');
  }
  return driveDocument;
}

const CANONICAL_FIXTURES: Array<{ source: string; expected: string }> = [
  {
    source:
      '# Evolución\r\n\r\n**Dolor** con [referencia](https://example.test).\r\n\r\n' +
      '- Leve\r\n- Control\r\n',
    expected: 'Evolución\n\nDolor con referencia (https://example.test).\n\n• Leve\n• Control\n',
  },
  {
    source: '> **Antecedente**\n\n`sin hallazgos`\n\n````\ntexto de código\n````\n',
    expected: 'Antecedente\n\nsin hallazgos\n\ntexto de código\n',
  },
  {
    source: '- Uno\n  - Dos\n1. Primero\n2. Segundo\n\nhttps://example.test\n',
    expected: '• Uno\n  • Dos\n1. Primero\n2. Segundo\n\nhttps://example.test\n',
  },
  {
    source: 'Texto <strong>importante</strong> <script>alert(1)</script>\n',
    expected: 'Texto importante alert(1)\n',
  },
  {
    source: 'Párrafo con   espacios horizontales   \n\n\n\nSiguiente párrafo',
    expected: 'Párrafo con   espacios horizontales\n\nSiguiente párrafo\n',
  },
];

describe('serializeToPlainText local Markdown export', () => {
  it.each(CANONICAL_FIXTURES)(
    'matches the shared canonical fixture corpus',
    ({ source, expected }) => {
      expect(seam().serializeToPlainText(source, 'local_markdown')).toBe(expected);
    },
  );

  it('is deterministic', () => {
    const source = '## Control\n\n- **Leve**\n- [nota](https://example.test)\n';
    expect(seam().serializeToPlainText(source, 'local_markdown')).toBe(
      seam().serializeToPlainText(source, 'local_markdown'),
    );
  });

  it('ends with exactly one LF', () => {
    const exported = seam().serializeToPlainText('texto\n\n\n', 'local_markdown');
    expect(exported).toBe('texto\n');
    expect(exported.endsWith('\n\n')).toBe(false);
  });

  it('preserves unicode and link destinations', () => {
    const exported = seam().serializeToPlainText(
      '**Sensibilidad**: niño — [guía](https://example.test/guía)',
      'local_markdown',
    );
    expect(exported).toBe('Sensibilidad: niño — guía (https://example.test/guía)\n');
  });

  it('removes HTML tags without creating an executable path', () => {
    const exported = seam().serializeToPlainText(
      '<img src=x onerror=alert(1)><b>Dolor</b>',
      'local_markdown',
    );
    expect(exported).toContain('Dolor');
    expect(exported).not.toContain('<');
    expect(exported).not.toContain('onerror');
  });
});

describe('serializeToPlainText persisted TXT identity', () => {
  it.each(['**negrita**', 'sin salto final', '# parece markdown\n', 'texto\n\n'])(
    'is byte-faithful for persisted plain text: %j',
    (content) => {
      expect(seam().serializeToPlainText(content, 'persisted_plain_text')).toBe(content);
    },
  );
});

describe('isDriveDocumentDirty', () => {
  const base = {
    localAuthoringContent: '# Título\n\ntexto\n',
    authoringRepresentation: 'local_markdown' as const,
  };

  it('is dirty when no persisted file exists', () => {
    expect(seam().isDriveDocumentDirty({ ...base, persistedPlainTextBaseline: null })).toBe(true);
  });

  it('is dirty when the export differs from the persisted baseline', () => {
    expect(
      seam().isDriveDocumentDirty({ ...base, persistedPlainTextBaseline: 'Título\n\ntexto\n' }),
    ).toBe(false);
    expect(
      seam().isDriveDocumentDirty({ ...base, persistedPlainTextBaseline: 'otra cosa\n' }),
    ).toBe(true);
  });

  it('derives clean state from the identity export of a persisted TXT', () => {
    expect(
      seam().isDriveDocumentDirty({
        localAuthoringContent: '**negrita**',
        authoringRepresentation: 'persisted_plain_text',
        persistedPlainTextBaseline: '**negrita**',
      }),
    ).toBe(false);
  });

  it('is never derived from an independent dirty boolean', () => {
    // The contract is the derived comparison; there is no fourth input.
    const state = {
      localAuthoringContent: 'a',
      authoringRepresentation: 'local_markdown' as const,
      persistedPlainTextBaseline: 'a\n',
    };
    expect(seam().isDriveDocumentDirty(state)).toBe(true);
  });
});

describe('normalizeDriveFileName', () => {
  it('appends .txt to an extensionless name', () => {
    expect(seam().normalizeDriveFileName('Nota')).toBe('Nota.txt');
  });

  it('visibly normalizes a .md destination to .txt', () => {
    expect(seam().normalizeDriveFileName('borrador.md')).toBe('borrador.txt');
    expect(seam().normalizeDriveFileName('borrador.MD')).toBe('borrador.txt');
    expect(seam().normalizeDriveFileName('borrador.Md')).toBe('borrador.txt');
  });

  it('keeps an existing .txt extension unchanged', () => {
    expect(seam().normalizeDriveFileName('nota.txt')).toBe('nota.txt');
    expect(seam().normalizeDriveFileName('nota.TXT')).toBe('nota.TXT');
  });
});
