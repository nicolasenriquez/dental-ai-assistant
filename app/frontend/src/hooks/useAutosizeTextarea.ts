import { type RefObject, useLayoutEffect } from 'react';

interface AutosizeOptions {
  ref: RefObject<HTMLTextAreaElement>;
  value: string;
  maxHeight?: number;
}

export function useAutosizeTextarea({ ref, value, maxHeight = 144 }: AutosizeOptions): void {
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    if (getComputedStyle(textarea).getPropertyValue('field-sizing') === 'content') {
      textarea.style.removeProperty('height');
      textarea.style.overflowY = 'auto';
      return;
    }

    textarea.style.height = '0px';
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(contentHeight, maxHeight)}px`;
    textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  }, [maxHeight, ref, value]);
}
