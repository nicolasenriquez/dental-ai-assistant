import type { DriveJournalDetail, DriveJournalEntry, DriveJournalSummary } from './api';

export interface DriveJournalGroup {
  period_type: DriveJournalSummary['period_type'];
  period_key: string;
  label: string;
  parts: DriveJournalSummary[];
}

function periodLabel(periodType: DriveJournalSummary['period_type'], periodKey: string): string {
  if (periodType === 'weekly') {
    const [, year, week] = periodKey.match(/^(\d{4})-W(\d{2})$/) ?? [];
    return year && week ? `Semana ${Number(week)} de ${year}` : periodKey;
  }

  const date = new Date(`${periodKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return periodKey;
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function groupDriveJournals(summaries: DriveJournalSummary[]): DriveJournalGroup[] {
  const groups = new Map<string, DriveJournalGroup>();
  for (const summary of summaries) {
    const key = `${summary.period_type}:${summary.period_key}`;
    const group = groups.get(key) ?? {
      period_type: summary.period_type,
      period_key: summary.period_key,
      label: periodLabel(summary.period_type, summary.period_key),
      parts: [],
    };
    group.parts.push(summary);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      parts: [...group.parts].sort((left, right) => left.journal_part - right.journal_part),
    }))
    .sort((left, right) => right.period_key.localeCompare(left.period_key));
}

export function filterDriveJournalEntries(
  detail: DriveJournalDetail,
  query: string,
): DriveJournalEntry[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return detail.entries;
  return detail.entries.filter((entry) =>
    [entry.patient_display_name, entry.patient_rut_masked, entry.content, entry.occurred_at].some(
      (value) => value.toLocaleLowerCase().includes(normalized),
    ),
  );
}
