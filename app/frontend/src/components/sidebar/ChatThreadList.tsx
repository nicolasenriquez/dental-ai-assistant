import type { ReactNode } from 'react';
import type {
  ConversationRuntime,
  RuntimeByConversationId,
} from '../../hooks/useStreamingResponse';
import type { Conversation } from '../../lib/api';
import { ConversationRow } from './ConversationList';
import { WorkspaceThreadList } from './WorkspaceThreadList';

interface ChatThreadListProps {
  conversations: Conversation[];
  loading: boolean;
  query: string;
  isCollapsed?: boolean;
  activeConversationId?: string;
  runtimeByConversationId?: RuntimeByConversationId;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onRename: (id: string, title: string) => void;
  error?: boolean;
  onRetry?: () => void;
  creating?: boolean;
}

export function ChatThreadList({
  conversations,
  loading,
  query,
  isCollapsed = false,
  activeConversationId,
  runtimeByConversationId,
  onNewChat,
  onSelect,
  onDeleteRequest,
  onRename,
  error = false,
  onRetry,
  creating = false,
}: ChatThreadListProps) {
  return (
    <WorkspaceThreadList
      ariaLabel="Conversaciones"
      title="Conversaciones"
      isCollapsed={isCollapsed}
      items={conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        updatedAt: conversation.updated_at,
        active: conversation.id === activeConversationId,
      }))}
      loading={loading}
      error={error}
      query={query}
      onCreate={onNewChat}
      onSelect={onSelect}
      creating={creating}
      onRetry={onRetry}
      emptyMessage="Aún no hay conversaciones"
      emptyActionLabel="Inicia tu primer chat"
      createLabel="Nuevo chat"
      showHeaderCreate={false}
      showCompactCreate={false}
      renderItem={(item): ReactNode => {
        const conversation = conversations.find(({ id }) => id === item.id);
        if (!conversation) return null;
        const runtime: ConversationRuntime | undefined = runtimeByConversationId?.[item.id];
        return (
          <ConversationRow
            conversation={conversation}
            query={query}
            isActive={item.active ?? false}
            runtime={runtime}
            onSelect={() => onSelect(item.id)}
            onDeleteRequest={() => onDeleteRequest(item.id)}
            onRename={(title) => onRename(item.id, title)}
          />
        );
      }}
    />
  );
}
