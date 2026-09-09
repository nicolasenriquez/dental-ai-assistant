import { useState } from 'react';
import type { Citation } from '../lib/api';
import { formatTimestamp } from './CitationModal';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MessageProps {
  role: 'user' | 'assistant';
  content: string;
  /** When true and content is empty, renders typing indicator */
  isStreaming?: boolean;
  /** RAG citations to display below the message */
  sources?: Citation[];
  /** Called when the user clicks a citation chip */
  onCitationClick?: (citation: Citation) => void;
  /** Current tool-call status during streaming (ephemeral progress indicator) */
  streamingStatus?: { tool: string; subject: string } | null;
  statusText?: string;
}

// ── Typing indicator (3 pulsing dots) ────────────────────────────
function TypingIndicator() {
  return (
    <div className="typing-indicator">
      <div className="typing-dot" />
      <div className="typing-dot" />
      <div className="typing-dot" />
    </div>
  );
}

// ── Source citations section ──────────────────────────────────────
// Two-tier citation render (issue #176): Tier 1 "Sources cited" (visible by
// default) when any chunk has is_cited=true; Tier 2 "All sources consulted"
// uses the existing toggle. Falls back to the legacy flat list when no chunk
// is marked (legacy data or model-forgot-markers fallback).
function citationChip(
  citation: Citation,
  i: number,
  onCitationClick: ((c: Citation) => void) | undefined,
  dimmed: boolean,
) {
  return (
    <button
      key={`${citation.chunk_id}-${i}`}
      type="button"
      onClick={() => onCitationClick?.(citation)}
      title={`${citation.video_title} at ${formatTimestamp(citation.start_seconds)}\n${citation.snippet}`}
      className={`citation-chip ${dimmed ? 'is-dimmed' : ''} focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none`}
    >
      {formatTimestamp(citation.start_seconds)} — {citation.video_title}
    </button>
  );
}

function SourceCitations({
  sources,
  onCitationClick,
}: {
  sources: Citation[];
  onCitationClick?: (citation: Citation) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!sources || sources.length === 0) return null;

  const cited = sources.filter((s) => s.is_cited === true);
  const consulted = sources.filter((s) => s.is_cited !== true);
  const showTwoTier = cited.length > 0;

  return (
    <div className="source-citations">
      {showTwoTier && (
        <>
          <div className="source-citations-heading">Fuentes citadas ({cited.length})</div>
          <div className="source-citations-list source-citations-list--cited">
            {cited.map((c, i) => citationChip(c, i, onCitationClick, false))}
          </div>
        </>
      )}

      {/* Toggle button (Tier 2 / legacy) */}
      {(!showTwoTier || consulted.length > 0) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="source-toggle focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          aria-expanded={expanded}
          aria-label={expanded ? 'Contraer fuentes' : 'Expandir fuentes'}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`source-toggle-icon ${expanded ? 'is-expanded' : ''}`}
          >
            <polyline points="4,2 8,6 4,10" />
          </svg>
          {showTwoTier
            ? `Todas las fuentes consultadas (${sources.length})`
            : `Fuentes (${sources.length})`}
        </button>
      )}

      {/* Citation chips */}
      {expanded && (
        <div className="source-citations-list source-citations-list--expanded">
          {(showTwoTier ? consulted : sources).map((c, i) =>
            citationChip(c, i, onCitationClick, showTwoTier),
          )}
        </div>
      )}
    </div>
  );
}

// ── Main message component ────────────────────────────────────────
export function Message({
  role,
  content,
  isStreaming,
  sources,
  onCitationClick,
  streamingStatus,
  statusText,
}: MessageProps) {
  const isUser = role === 'user';
  const hasSources = !isUser && Array.isArray(sources) && sources.length > 0;

  return (
    <article
      className={`message-row ${isUser ? 'is-user' : 'is-assistant'}`}
      aria-label={isUser ? 'Tú' : 'Asistente'}
    >
      <div className="message-content">
        <div className="message-turn-label" aria-hidden="true">
          {isUser ? 'Tú' : 'Asistente'}
        </div>
        {isStreaming && !content ? (
          streamingStatus ? (
            <div className="text-slate-400 text-[13px] italic">
              {streamingStatus.subject ? `Buscando: ${streamingStatus.subject}…` : 'Procesando…'}
            </div>
          ) : (
            <TypingIndicator />
          )
        ) : isUser ? (
          <span className="message-user-text">{content}</span>
        ) : (
          <>
            <MarkdownRenderer content={content} />
            {hasSources && <SourceCitations sources={sources} onCitationClick={onCitationClick} />}
            {statusText && (
              <p className="message-status" role="status">
                {statusText}
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
}
