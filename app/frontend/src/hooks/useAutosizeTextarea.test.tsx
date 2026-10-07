import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAutosizeTextarea } from './useAutosizeTextarea';

function AutosizeHarness({ value, maxHeight = 144 }: { value: string; maxHeight?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea({ ref, value, maxHeight });
  return <textarea ref={ref} value={value} readOnly aria-label="draft" onChange={() => {}} />;
}

describe('useAutosizeTextarea', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it('uses the fallback when the browser supports field-sizing but the control does not enable it', () => {
    vi.stubGlobal('CSS', { supports: () => true });
    const view = render(<AutosizeHarness value="Short" />);
    const textarea = view.getByRole('textbox');
    Object.defineProperty(textarea, 'scrollHeight', { configurable: true, value: 220 });
    view.rerender(<AutosizeHarness value="Longer" />);
    expect(textarea).toHaveStyle({ height: '144px', overflowY: 'auto' });
  });
  it('leaves sizing to CSS only when the control actually uses content sizing', () => {
    vi.stubGlobal('CSS', { supports: () => true });
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({
      getPropertyValue: () => 'content',
    } as unknown as CSSStyleDeclaration);
    const view = render(<AutosizeHarness value="Native" />);
    expect(view.getByRole('textbox').style.overflowY).toBe('auto');
    expect(view.getByRole('textbox').style.height).toBe('');
  });
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
