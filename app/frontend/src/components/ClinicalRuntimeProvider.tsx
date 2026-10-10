import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useLocation, useMatch } from 'react-router-dom';
import {
  type ClinicalAssistantController,
  useClinicalAssistant,
} from '../hooks/useClinicalAssistant';
import type { ComposerContextItem } from '../lib/api';

export interface ClinicalQueuedEntry {
  id: string;
  content: string;
  contextItems: ComposerContextItem[];
  patientId: string | null;
  patientName: string;
}

export interface ArtifactEditBuffer {
  value: string;
  baseline: string;
  editing: boolean;
  applied: boolean;
}

interface ClinicalMemory {
  drafts: Record<string, string>;
  setDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  queues: Record<string, ClinicalQueuedEntry[]>;
  setQueues: Dispatch<SetStateAction<Record<string, ClinicalQueuedEntry[]>>>;
  attachments: Record<string, ComposerContextItem[]>;
  setAttachments: Dispatch<SetStateAction<Record<string, ComposerContextItem[]>>>;
  artifactBuffers: Record<string, ArtifactEditBuffer>;
  setArtifactBuffer: (key: string, buffer: ArtifactEditBuffer | null) => void;
}

interface SharedClinicalRuntime {
  activeThreadId: string | null;
  activate: (threadId: string) => void;
  controller: ClinicalAssistantController;
}

const RuntimeContext = createContext<SharedClinicalRuntime | null>(null);
const MemoryContext = createContext<ClinicalMemory | null>(null);

export function useOptionalClinicalRuntime(): SharedClinicalRuntime | null {
  return useContext(RuntimeContext);
}

export function useClinicalComposerMemory(): ClinicalMemory | null {
  return useContext(MemoryContext);
}

export function ClinicalRuntimeProvider({ children }: { children: ReactNode }): JSX.Element {
  const routeThreadId = useMatch('/a/:threadId')?.params.threadId;
  const [activeThreadId, setActiveThreadId] = useState<string | null>(routeThreadId ?? null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [queues, setQueues] = useState<Record<string, ClinicalQueuedEntry[]>>({});
  const [attachments, setAttachments] = useState<Record<string, ComposerContextItem[]>>({});
  const [artifactBuffers, setArtifactBuffers] = useState<Record<string, ArtifactEditBuffer>>({});
  const setArtifactBuffer = useCallback((key: string, buffer: ArtifactEditBuffer | null) => {
    setArtifactBuffers((current) => {
      if (!buffer) {
        if (!(key in current)) return current;
        const next = { ...current };
        delete next[key];
        return next;
      }
      return { ...current, [key]: buffer };
    });
  }, []);
  const activate = useCallback((id: string) => setActiveThreadId(id), []);
  const hasUnsentWork =
    Object.values(drafts).some((draft) => draft.length > 0) ||
    Object.values(queues).some((queue) => queue.length > 0) ||
    Object.values(attachments).some((items) => items.length > 0) ||
    Object.values(artifactBuffers).some((buffer) => buffer.value !== buffer.baseline);
  useEffect(() => {
    if (!hasUnsentWork) return;
    const protectUnsentWork = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', protectUnsentWork);
    return () => window.removeEventListener('beforeunload', protectUnsentWork);
  }, [hasUnsentWork]);
  useEffect(() => {
    if (routeThreadId) activate(routeThreadId);
  }, [activate, routeThreadId]);

  return (
    <MemoryContext.Provider
      value={{
        drafts,
        setDrafts,
        queues,
        setQueues,
        attachments,
        setAttachments,
        artifactBuffers,
        setArtifactBuffer,
      }}
    >
      <ClinicalRuntimeSession activeThreadId={activeThreadId} activate={activate}>
        {children}
      </ClinicalRuntimeSession>
    </MemoryContext.Provider>
  );
}

function ClinicalRuntimeSession({
  children,
  activeThreadId,
  activate,
}: {
  children: ReactNode;
  activeThreadId: string | null;
  activate: (threadId: string) => void;
}): JSX.Element {
  const controller = useClinicalAssistant(activeThreadId ?? undefined);
  const location = useLocation();
  useEffect(() => {
    // ponytail: one attached controller; server persistence handles older threads.
    return () => controller.detach();
  }, [location.pathname, controller.detach]);
  return (
    <RuntimeContext.Provider value={{ activeThreadId, activate, controller }}>
      {children}
    </RuntimeContext.Provider>
  );
}
