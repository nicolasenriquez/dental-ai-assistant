import type { ClinicalActivityItem as ActivityItemData } from '../../hooks/useClinicalAssistant';

export function ActivityItem({ item }: { item: ActivityItemData }) {
  const running = item.status === 'running';
  return (
    <div className="clinical-activity" role="status" aria-live="polite">
      <span className={running ? 'clinical-activity-icon clinical-activity-icon--running' : 'clinical-activity-icon'} aria-hidden="true">
        {running ? '○' : '✓'}
      </span>
      <span>{item.label}{running ? '…' : ''}</span>
    </div>
  );
}
