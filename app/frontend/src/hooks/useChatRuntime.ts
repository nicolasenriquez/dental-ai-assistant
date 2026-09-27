import { createContext, useContext } from 'react';
import type { useStreamingResponse } from './useStreamingResponse';

export const ChatRuntimeContext = createContext<ReturnType<typeof useStreamingResponse> | null>(
  null,
);

export function useChatRuntime(): ReturnType<typeof useStreamingResponse> {
  const runtime = useContext(ChatRuntimeContext);
  if (!runtime) throw new Error('Chat runtime is only available in authenticated routes');
  return runtime;
}
