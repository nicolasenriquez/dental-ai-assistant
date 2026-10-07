import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { updateProfessionalProfile } from '../lib/authApi';
import { Button } from './ui/Button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from './ui/sheet';

export function ProfessionalProfile({
  onClose,
  returnFocus,
}: { onClose: () => void; returnFocus?: HTMLElement | null }): JSX.Element {
  const { user, refresh } = useAuth();
  const [name, setName] = useState(user?.professional_display_name ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent
        onCloseAutoFocus={(event) => {
          if (returnFocus) {
            event.preventDefault();
            returnFocus.focus();
          }
        }}
      >
        <SheetHeader>
          <SheetTitle>Perfil profesional</SheetTitle>
        </SheetHeader>
        <form
          className="mt-4 space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await updateProfessionalProfile(name.trim() || null);
              await refresh();
              onClose();
            } catch {
              setError('No pudimos guardar el nombre. Conservamos tu texto; vuelve a intentar.');
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block space-y-2 text-sm">
            <span>Nombre profesional</span>
            <input
              autoFocus
              maxLength={120}
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              className="min-h-[44px] w-full rounded border border-border bg-surface px-3 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            />
          </label>
          <p className="text-sm text-muted">
            Nombre declarado de tu cuenta, visible como autor en registros clínicos. Dejarlo vacío
            muestra tu identificador de usuario.
          </p>
          {error && <p role="alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="clinical" disabled={busy} aria-busy={busy}>
              {busy ? 'Guardando…' : 'Guardar nombre'}
            </Button>
            <Button type="button" variant="clinicalSecondary" disabled={busy} onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
