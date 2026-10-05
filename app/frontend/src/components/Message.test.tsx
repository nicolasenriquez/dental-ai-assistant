import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Message } from './Message';

describe('Message — streamingStatus rendering', () => {
  it('renders the searching indicator with subject when streaming and status is set', () => {
    render(
      <Message
        role="assistant"
        content=""
        isStreaming={true}
        streamingStatus={{ tool: 'search_videos', subject: 'building agents' }}
      />,
    );
    expect(screen.getByText('Buscando: building agents…')).toBeInTheDocument();
    expect(screen.queryByText('Procesando…')).not.toBeInTheDocument();
  });

  it('renders the processing fallback when streaming and subject is empty', () => {
    render(
      <Message
        role="assistant"
        content=""
        isStreaming={true}
        streamingStatus={{ tool: 'unknown_tool', subject: '' }}
      />,
    );
    expect(screen.getByText('Procesando…')).toBeInTheDocument();
    expect(screen.queryByText(/Buscando/)).not.toBeInTheDocument();
  });

  it('renders TypingIndicator when isStreaming, no content, no streamingStatus', () => {
    render(<Message role="assistant" content="" isStreaming={true} streamingStatus={null} />);
    expect(screen.queryByText(/Buscando/)).not.toBeInTheDocument();
    expect(screen.queryByText('Procesando…')).not.toBeInTheDocument();
    // TypingIndicator renders 3 typing-dot divs
    const dots = document.querySelectorAll('.typing-dot');
    expect(dots).toHaveLength(3);
  });

  it('renders content instead of status indicator when content is present', () => {
    render(
      <Message
        role="assistant"
        content="Answer here."
        isStreaming={true}
        streamingStatus={{ tool: 'search_videos', subject: 'building agents' }}
      />,
    );
    expect(screen.getByText('Answer here.')).toBeInTheDocument();
    expect(screen.queryByText(/Buscando/)).not.toBeInTheDocument();
  });
});
