/**
 * Fail-first primitive-allowlist test for the Drive workspace (task 5.1).
 *
 * Design decision 24: the only shadcn/Radix primitives allowed for the Drive
 * experience are `Resizable`, `Sheet`, `ScrollArea`, `AlertDialog`, and
 * `Alert`. Existing/native Button, Input, Textarea, Badge, Tooltip, Spinner,
 * loading, and empty patterns are reused — no Tabs, ToggleGroup, Progress,
 * Dialog, Drawer, Command, Combobox, Card-per-file, DataTable, or another
 * Markdown renderer may be introduced. Generated sources live under
 * `src/components/ui/`.
 */

import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_DIR = path.join(process.cwd(), 'src', 'components', 'ui');

const APPROVED = new Set([
  'resizable.tsx',
  'sheet.tsx',
  'scroll-area.tsx',
  'alert-dialog.tsx',
  'alert.tsx',
]);

const FORBIDDEN_BASES = [
  'tabs',
  'toggle-group',
  'progress',
  'dialog',
  'drawer',
  'command',
  'combobox',
  'card',
  'table',
  'input',
  'textarea',
  'badge',
  'tooltip',
  'skeleton',
  'popover',
  'select',
  'checkbox',
  'pagination',
  'label',
  'separator',
];

describe('shadcn primitive allowlist', () => {
  it('adds only the approved primitives under src/components/ui', () => {
    expect(existsSync(UI_DIR), 'task 5.2 must add the src/components/ui primitive layer').toBe(
      true,
    );

    if (!existsSync(UI_DIR)) return;
    const files = readdirSync(UI_DIR).filter((name) => name.endsWith('.tsx'));

    for (const required of APPROVED) {
      expect(files, `missing approved primitive ${required}`).toContain(required);
    }
    for (const file of files) {
      const base = file.replace(/\.tsx$/, '');
      expect(
        APPROVED.has(file),
        `non-allowlisted primitive "${file}" — reuse existing/native components instead`,
      ).toBe(true);
      expect(FORBIDDEN_BASES, `forbidden primitive shipped: ${file}`).not.toContain(base);
    }
  });
});
