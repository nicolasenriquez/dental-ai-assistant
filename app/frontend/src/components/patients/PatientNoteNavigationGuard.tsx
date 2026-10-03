import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';

export function PatientNoteNavigationGuard({
  dirty,
  onBlocked,
}: {
  dirty: boolean;
  onBlocked: (proceed: () => void, cancel: () => void) => void;
}): null {
  const blocker = useBlocker(dirty);
  useEffect(() => {
    if (blocker.state === 'blocked') onBlocked(blocker.proceed, blocker.reset);
  }, [blocker, onBlocked]);
  return null;
}
