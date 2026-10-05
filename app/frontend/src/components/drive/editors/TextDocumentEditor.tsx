import { useRef, useState } from 'react';

interface TextDocumentEditorProps {
  value: string;
  onChange: (value: string) => void;
  onSelectionChange: (selection: string) => void;
  readOnly?: boolean;
}

export function TextDocumentEditor({
  value,
  onChange,
  onSelectionChange,
  readOnly,
}: TextDocumentEditorProps) {
  const editor = useRef<HTMLTextAreaElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState('');
  const [current, setCurrent] = useState(-1);
  const matches: number[] = [];
  if (query) {
    for (
      let offset = value.indexOf(query);
      offset !== -1;
      offset = value.indexOf(query, offset + query.length)
    ) {
      matches.push(offset);
    }
  }
  const find = (direction: number) => {
    if (!matches.length) return;
    const next = (current + direction + matches.length) % matches.length;
    setCurrent(next);
    onSelectionChange('');
    editor.current?.focus();
    editor.current?.setSelectionRange(matches[next], matches[next] + query.length);
  };
  return (
    <div
      className="flex min-h-0 flex-1 flex-col gap-2"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'f') {
          event.preventDefault();
          setFinding(true);
          requestAnimationFrame(() => search.current?.focus());
        }
        if (event.key === 'Escape' && finding) {
          event.preventDefault();
          event.stopPropagation();
          setFinding(false);
          editor.current?.focus();
        }
      }}
    >
      <button
        type="button"
        className="drive-btn drive-btn-secondary"
        onClick={() => {
          setFinding(true);
          requestAnimationFrame(() => search.current?.focus());
        }}
      >
        Buscar dentro del documento
      </button>
      {finding && (
        <div className="flex items-center gap-2">
          <input
            ref={search}
            type="search"
            className="drive-search min-w-0 flex-1"
            aria-label="Buscar dentro del documento"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCurrent(-1);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                find(event.shiftKey ? -1 : 1);
              }
            }}
          />
          <span role="status">
            {current >= 0 && current < matches.length ? current + 1 : 0} de {matches.length}
          </span>
          <button
            type="button"
            aria-label="Coincidencia anterior"
            disabled={!matches.length}
            onClick={() => find(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Coincidencia siguiente"
            disabled={!matches.length}
            onClick={() => find(1)}
          >
            ↓
          </button>
        </div>
      )}
      <textarea
        ref={editor}
        aria-label="Contenido del documento"
        className="drive-search min-h-64 flex-1 resize-none p-4"
        value={value}
        readOnly={readOnly}
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
          onSelectionChange('');
          setCurrent(-1);
        }}
        onSelect={(event) => {
          const target = event.currentTarget;
          onSelectionChange(value.slice(target.selectionStart, target.selectionEnd));
        }}
      />
    </div>
  );
}
