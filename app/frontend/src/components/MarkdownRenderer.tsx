import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import oneDark from 'react-syntax-highlighter/dist/esm/styles/prism/one-dark';
import remarkGfm from 'remark-gfm';

// ── Copy button for code blocks ──────────────────────────────────
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = code;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button onClick={handleCopy} className={`copy-btn${copied ? ' copied' : ''}`}>
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

// ── Code block with header (language label + copy) ────────────────
interface CodeBlockProps {
  language: string | null;
  code: string;
}

function CodeBlock({ language, code }: CodeBlockProps) {
  const [SyntaxHighlighter, setSyntaxHighlighter] = useState<
    typeof import('react-syntax-highlighter')['Prism'] | null
  >(null);
  const [highlightError, setHighlightError] = useState(false);
  useEffect(() => {
    if (!language) return;
    let cancelled = false;
    setHighlightError(false);
    // Prism's automatic DOM scan must not overwrite React-rendered Refractor tokens.
    const prismWindow = window as Window & { Prism?: { manual?: boolean } };
    prismWindow.Prism ??= {};
    prismWindow.Prism.manual = true;
    void import('react-syntax-highlighter')
      .then(({ Prism }) => {
        if (!cancelled) setSyntaxHighlighter(() => Prism);
      })
      .catch(() => {
        if (!cancelled) setHighlightError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [language]);
  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-lang-label">{language || 'plaintext'}</span>
        <CopyButton code={code} />
      </div>
      {language && SyntaxHighlighter ? (
        <SyntaxHighlighter
          style={oneDark as Record<string, React.CSSProperties>}
          language={language}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: 0,
            background: 'var(--code-surface)',
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          }}
        >
          {code}
        </SyntaxHighlighter>
      ) : (
        <pre
          style={{
            margin: 0,
            padding: '12px 16px',
            background: 'var(--code-surface)',
            fontSize: 13,
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            overflowX: 'auto',
            color: 'var(--text-primary)',
          }}
        >
          <code>{code}</code>
        </pre>
      )}
      {highlightError && (
        <p className="text-sm text-muted" role="status">
          Resaltado no disponible. Puedes leer y copiar el código.
        </p>
      )}
    </div>
  );
}

// ── Markdown renderer ─────────────────────────────────────────────
interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const components: Components = {
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const codeStr = String(children).replace(/\n$/, '');

      // react-markdown v9 passes `node` — detect block vs inline by presence
      // of a language class or multi-line content
      const isBlock = Boolean(match) || codeStr.includes('\n');

      if (isBlock) {
        return <CodeBlock language={match ? match[1] : null} code={codeStr} />;
      }

      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
  };

  return (
    <div className="assistant-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
