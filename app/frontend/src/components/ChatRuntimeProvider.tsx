import type { ReactNode } from 'react';
import { ChatRuntimeContext } from '../hooks/useChatRuntime';
import { useStreamingResponse } from '../hooks/useStreamingResponse';

interface ChatRuntimeProviderProps {
  children: ReactNode;
}

export function ChatRuntimeProvider({ children }: ChatRuntimeProviderProps) {
  const runtime = useStreamingResponse();
  return <ChatRuntimeContext.Provider value={runtime}>{children}</ChatRuntimeContext.Provider>;
}
