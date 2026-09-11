export interface ComposerSelection {
  start: number;
  end: number;
  selectedText: string;
}

export function captureComposerSelection(element: HTMLTextAreaElement | null): ComposerSelection {
  const value = element?.value ?? '';
  const start = element?.selectionStart ?? value.length;
  const end = element?.selectionEnd ?? start;
  return { start, end, selectedText: value.slice(start, end) };
}

export function insertTranscript(
  value: string,
  transcript: string,
  selection: ComposerSelection,
): { value: string; caret: number } {
  const valid =
    selection.start <= value.length &&
    selection.end <= value.length &&
    value.slice(selection.start, selection.end) === selection.selectedText;
  const start = valid ? selection.start : value.length;
  const end = valid ? selection.end : value.length;
  const before = value.slice(0, start);
  const after = value.slice(end);
  const leading = before && !/\s$/.test(before) && !/^\s/.test(transcript) ? ' ' : '';
  const trailing = after && !/^\s/.test(after) && !/\s$/.test(transcript) ? ' ' : '';
  const inserted = `${leading}${transcript}${trailing}`;
  return {
    value: `${before}${inserted}${after}`,
    caret: start + inserted.length - trailing.length,
  };
}
