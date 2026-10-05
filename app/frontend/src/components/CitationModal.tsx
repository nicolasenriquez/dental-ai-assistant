import * as Dialog from '@radix-ui/react-dialog';
import { useRef } from 'react';
import type { Citation } from '../lib/api';
import { formatTimestamp } from '../lib/timestamp';
import { extractYouTubeVideoId } from '../lib/youtube';

interface CitationModalProps {
  citation: Citation;
  onClose: () => void;
}

export { formatTimestamp } from '../lib/timestamp';

export function CitationModal({ citation, onClose }: CitationModalProps) {
  const previousFocus = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  // Issue #147: paid Dynamous course / workshop citations render without an
  // embedded player. Circle doesn't support timestamp deep-links, so we link
  // straight to the lesson URL with the (MM:SS) shown as text in the header.
  const isDynamous = citation.source_type === 'dynamous';

  const videoId = isDynamous ? null : extractYouTubeVideoId(citation.video_url);

  const startSeconds = Math.floor(citation.start_seconds);

  const embedUrl = videoId
    ? `https://www.youtube.com/embed/${videoId}?start=${startSeconds}&autoplay=1`
    : '';

  const externalUrl = isDynamous
    ? (citation.lesson_url ?? '')
    : videoId
      ? `https://www.youtube.com/watch?v=${videoId}&t=${startSeconds}s`
      : '';

  const externalLabel = isDynamous ? 'Abrir en Dynamous' : 'Abrir en YouTube';

  // Truncate snippet to max 300 display chars (297 + ellipsis)
  const snippetDisplay =
    citation.snippet.length > 300 ? citation.snippet.slice(0, 297) + '…' : citation.snippet;

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
          onClick={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
        >
          <Dialog.Content
            aria-describedby={undefined}
            className="bg-surface-raised border border-border rounded-xl p-6 w-[640px] max-w-[calc(100vw-48px)] max-h-[90vh] flex flex-col shadow-2xl"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (previousFocus.current?.isConnected) previousFocus.current.focus();
            }}
          >
            {/* Header */}
            <div className="flex justify-between items-center gap-3 mb-4">
              <div className="min-w-0">
                <Dialog.Title asChild>
                  <h3 className="text-foreground text-base font-semibold m-0 break-words">
                    {citation.video_title}
                  </h3>
                </Dialog.Title>
                <p className="text-muted text-xs m-0 mt-0.5">
                  en {formatTimestamp(citation.start_seconds)} –{' '}
                  {formatTimestamp(citation.end_seconds)}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="h-[44px] w-[44px] shrink-0 flex items-center justify-center bg-transparent border-none text-muted cursor-pointer text-xl leading-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                aria-label="Cerrar cita"
              >
                ×
              </button>
            </div>

            {/* Content: YouTube iframe (top) + transcript (bottom).
            Dynamous citations skip the iframe — Circle has no embed/deep-link
            support, so the snippet + external link is all we render. */}
            <div className="flex-1 min-h-0 flex flex-col gap-4 mb-4 overflow-y-auto">
              {!isDynamous && (
                <div className="w-full aspect-video">
                  {embedUrl ? (
                    <iframe
                      src={embedUrl}
                      allow="autoplay; encrypted-media"
                      allowFullScreen
                      title="YouTube video player"
                      className="w-full h-full rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-surface rounded-lg text-muted text-sm">
                      Video no disponible
                    </div>
                  )}
                </div>
              )}

              {/* Transcript snippet */}
              <div>
                <h4 className="text-foreground text-sm font-semibold mb-1">
                  Extracto de transcripción
                </h4>
                <p className="text-foreground text-sm leading-relaxed m-0 whitespace-pre-wrap">
                  {snippetDisplay}
                </p>
              </div>
            </div>

            {/* Footer: external link */}
            <div className="flex justify-end">
              {externalUrl ? (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-11 flex items-center gap-1 text-xs text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {externalLabel}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 9L9 1M9 1H3M9 1v6" />
                  </svg>
                </a>
              ) : null}
            </div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
