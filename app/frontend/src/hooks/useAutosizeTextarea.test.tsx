import { render } from '@testing-library/react';
import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { useAutosizeTextarea } from './useAutosizeTextarea';

function AutosizeHarness({ value, maxHeight = 144 }: { value: string; maxHeight?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea({ ref, value, maxHeight });
  return <textarea ref={ref} value={value} readOnly aria-label="draft" onChange={() => {}} />;
}

describe('useAutosizeTextarea', () => {
  it('grows with a controlled draft and switches to internal scroll at the cap', () => {
    const view = render(<AutosizeHarness value="One line" />);
    const textarea = view.getByRole('textbox');

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 220 });
    view.rerender(<AutosizeHarness value={'One line\nTwo lines\nThree lines'} />);

    expect(textarea).toHaveStyle({ height: '144px', overflowY: 'auto' });
  });

  it('keeps short content below the cap without a scrollbar', () => {
    const view = render(<AutosizeHarness value="Short" maxHeight={144} />);
    const textarea = view.getByRole('textbox');

    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 72 });
    view.rerender(<AutosizeHarness value={'Short\nupdated'} maxHeight={144} />);

    expect(textarea).toHaveStyle({ height: '72px', overflowY: 'hidden' });
  });
});
