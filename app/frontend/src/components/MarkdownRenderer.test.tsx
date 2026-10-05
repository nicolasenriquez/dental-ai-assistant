import { render, screen, waitFor } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MarkdownRenderer } from './MarkdownRenderer';

it('preserves code text when the deferred highlighter finishes loading', async () => {
  const { container } = render(
    <MarkdownRenderer content={'```javascript\nconst answer = 42;\n```'} />,
  );
  expect(screen.getByRole('button', { name: 'Copy' })).toBeVisible();
  await waitFor(() => expect(container.querySelector('.token')).not.toBeNull());
  expect(container.querySelector('.code-block-wrapper code')).toHaveTextContent(
    'const answer = 42;',
  );
});
