import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useOptionalClinicalRuntime } from '../ClinicalRuntimeProvider';
import { Button } from '../ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { ClinicalAssistantArea } from './ClinicalAssistantArea';

export function ContextualAssistant({
  threadId,
  width,
  onClose,
  onChanged,
}: {
  threadId: string;
  width: number;
  onClose: () => void;
  onChanged: () => void;
}): JSX.Element | null {
  const shared = useOptionalClinicalRuntime();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    heading.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[role="alertdialog"]')) onClose();
    };
    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('keydown', keydown);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [onClose]);
  useEffect(() => {
    if (shared?.activeThreadId === threadId) void shared.controller.reload();
  }, [shared?.activeThreadId, threadId]);
  if (!shared || shared.activeThreadId !== threadId) return null;
  const content = (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border p-3">
        <h2 ref={heading} tabIndex={-1} className="font-semibold">
          Asistente clínico
        </h2>
        <Button variant="clinicalSecondary" aria-label="Cerrar asistente" onClick={onClose}>
          <X aria-hidden="true" size={18} />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <ClinicalAssistantArea
          threadId={threadId}
          assistant={shared.controller}
          onThreadStateChanged={onChanged}
        />
      </div>
      <Link
        className="border-t border-border px-4 py-3 text-sm text-primary hover:underline"
        to={`/a/${threadId}`}
      >
        Abrir asistente completo
      </Link>
    </div>
  );
  if (width < 1024)
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent className="w-[min(88vw,560px)] p-0" aria-describedby={undefined}>
          <SheetHeader className="sr-only">
            <SheetTitle>Asistente clínico</SheetTitle>
          </SheetHeader>
          {content}
        </SheetContent>
      </Sheet>
    );
  return (
    <aside
      aria-label="Asistente del paciente"
      className="sticky top-0 h-[calc(100dvh-6rem)] w-[clamp(420px,38vw,520px)] shrink-0 overflow-hidden rounded-xl border border-border"
    >
      {content}
    </aside>
  );
}
