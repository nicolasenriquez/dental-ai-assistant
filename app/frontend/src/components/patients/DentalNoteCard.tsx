import { ListChecks, Stethoscope, Syringe, UserCog } from 'lucide-react';
import { useState } from 'react';
import type { DentalClinicalNote } from '../../lib/api';
import { formatClinicalDateShort, formatClinicalTime } from '../../lib/clinicalDate';
import { Button } from '../ui/Button';
import { PatientActorLabel } from './PatientActorLabel';

const types = {
  diagnosis: {
    label: 'Diagnóstico',
    Icon: Stethoscope,
    color: 'text-primary',
    edge: 'border-l-primary',
  },
  treatment: {
    label: 'Tratamiento',
    Icon: Syringe,
    color: 'text-success',
    edge: 'border-l-success',
  },
  treatment_plan: { label: 'Plan', Icon: ListChecks, color: 'text-muted', edge: 'border-l-border' },
  administrative: {
    label: 'Administrativa',
    Icon: UserCog,
    color: 'text-muted',
    edge: 'border-l-border',
  },
};
interface DentalNoteCardProps {
  note: DentalClinicalNote;
  onHighlight: (teeth: number[]) => void;
  onEdit: () => void;
  onDelete: () => void;
  disabled: boolean;
}

export function DentalNoteCard({
  note,
  onHighlight,
  onEdit,
  onDelete,
  disabled,
}: DentalNoteCardProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const { label, Icon, color, edge } = types[note.note_type];
  const elapsedMinutes = (new Date(note.created_at).getTime() - Date.now()) / 60000;
  const relativeDate = new Intl.RelativeTimeFormat('es', { numeric: 'auto' }).format(
    Math.round(
      elapsedMinutes /
        (Math.abs(elapsedMinutes) >= 1440 ? 1440 : Math.abs(elapsedMinutes) >= 60 ? 60 : 1),
    ),
    Math.abs(elapsedMinutes) >= 1440 ? 'day' : Math.abs(elapsedMinutes) >= 60 ? 'hour' : 'minute',
  );
  return (
    <article
      aria-label={`Nota ${label}`}
      onMouseEnter={() => onHighlight(note.linked_teeth)}
      onMouseLeave={() => onHighlight([])}
      onFocus={() => onHighlight(note.linked_teeth)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onHighlight([]);
      }}
      className={`space-y-2 rounded-lg border border-border border-l-[3px] bg-surface p-3 ${edge}`}
    >
      <div className={`flex items-center gap-2 text-sm ${color}`}>
        <Icon size={16} aria-hidden="true" />
        {label}
      </div>
      <div className="text-xs text-muted">
        <PatientActorLabel actor={{ user_id: note.created_by, display_name: null }} /> ·{' '}
        <time
          dateTime={note.created_at}
          title={`${formatClinicalDateShort(note.created_at)} ${formatClinicalTime(note.created_at)}`}
        >
          {relativeDate}
        </time>
      </div>
      {(note.tooth_fdi || note.entity_label) && (
        <p className="text-xs">{note.tooth_fdi ? `Diente ${note.tooth_fdi}` : note.entity_label}</p>
      )}
      <p className="whitespace-pre-wrap break-words text-sm">
        {expanded ? note.body : note.body.slice(0, 280)}
        {!expanded && note.body.length > 280 ? '…' : ''}
      </p>
      {note.body.length > 280 && (
        <Button variant="clinicalSecondary" onClick={() => setExpanded((value) => !value)}>
          {expanded ? 'Ver menos' : 'Ver más'}
        </Button>
      )}
      {note.note_type !== 'administrative' && (
        <div className="flex flex-wrap gap-2">
          <Button variant="clinicalSecondary" disabled={disabled} onClick={onEdit}>
            Editar nota
          </Button>
          <Button variant="clinicalSecondary" disabled={disabled} onClick={onDelete}>
            Eliminar nota
          </Button>
        </div>
      )}
    </article>
  );
}
