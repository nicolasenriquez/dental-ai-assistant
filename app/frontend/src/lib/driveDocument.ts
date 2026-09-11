/**
 * Drive document model: deterministic Markdown-to-plain-text export,
 * managed-name normalization, and derived dirty state (design decision 25).
 *
 * The fixture corpus is shared with the backend Picker conversion
 * (`tests/test_google_drive_text_export.py`): frontend local export and
 * backend import produce byte-identical plain text.
 */

export type AuthoringRepresentation = 'local_markdown' | 'persisted_plain_text';

export interface DriveDocumentState {
  localAuthoringContent: string;
  authoringRepresentation: AuthoringRepresentation;
  persistedPlainTextBaseline: string | null;
}

const STRONG_RE = /(\*\*|__)(.+?)\1/g;
const EMPH_RE = /(?<![\w*])([*_])([^\s*_](?:[^*_]*?[^\s*_])?)\1(?!\w)/g;
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;
const AUTOLINK_RE = /<((?:https?:\/\/|mailto:)[^>]+)>/g;
const CODE_SPAN_RE = /`+([^`]+)`+/g;
const HTML_TAG_RE = /<[^>]*>/g;
const HEADING_RE = /^#{1,6}\s+/;
const BLOCKQUOTE_RE = /^>+\s?/;
const BULLET_RE = /^(\s*)[-*+]\s+(.*)$/;
const FENCE_OPEN_RE = /^(```+|~~~+)/;
const TRAILING_WS_RE = /[ \t]+$/;

function inlineTransform(text: string): string {
  return text
    .replace(STRONG_RE, '$2')
    .replace(EMPH_RE, '$2')
    .replace(LINK_RE, '$1 ($2)')
    .replace(AUTOLINK_RE, '$1')
    .replace(CODE_SPAN_RE, '$1')
    .replace(HTML_TAG_RE, '');
}

function stripMarkdown(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines: string[] = [];
  let inFence = false;
  for (const line of normalized.split('\n')) {
    let stripped = line.replace(TRAILING_WS_RE, '');
    if (inFence) {
      if (FENCE_OPEN_RE.test(stripped)) {
        inFence = false;
      } else {
        lines.push(stripped);
      }
      continue;
    }
    if (FENCE_OPEN_RE.test(stripped)) {
      inFence = true;
      continue;
    }
    stripped = stripped.replace(BLOCKQUOTE_RE, '');
    stripped = stripped.replace(HEADING_RE, '');
    const bullet = BULLET_RE.exec(stripped);
    if (bullet) {
      stripped = `${bullet[1]}• ${bullet[2]}`;
    }
    lines.push(inlineTransform(stripped));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

export function serializeToPlainText(
  content: string,
  representation: AuthoringRepresentation,
): string {
  if (representation === 'persisted_plain_text') {
    return content;
  }
  return stripMarkdown(content).replace(/\n+$/, '') + '\n';
}

export function normalizeDriveFileName(name: string): string {
  if (/\.md$/i.test(name)) {
    return name.replace(/\.md$/i, '.txt');
  }
  if (!/\.[^./\\]+$/.test(name)) {
    return `${name}.txt`;
  }
  return name;
}

export function isDriveDocumentDirty(state: DriveDocumentState): boolean {
  if (state.persistedPlainTextBaseline === null) {
    return true;
  }
  const comparable =
    state.authoringRepresentation === 'persisted_plain_text'
      ? state.localAuthoringContent
      : stripMarkdown(state.localAuthoringContent);
  return comparable !== state.persistedPlainTextBaseline;
}
