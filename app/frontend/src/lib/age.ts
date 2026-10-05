export function getPatientAge(
  birthDate: string | null | undefined,
  today = new Date(),
): number | null {
  if (!birthDate) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birth = new Date(year, month - 1, day);

  if (
    birth.getFullYear() !== year ||
    birth.getMonth() !== month - 1 ||
    birth.getDate() !== day ||
    birth > today
  ) {
    return null;
  }

  let age = today.getFullYear() - year;
  const hasHadBirthday =
    today.getMonth() > month - 1 || (today.getMonth() === month - 1 && today.getDate() >= day);

  if (!hasHadBirthday) age -= 1;
  return age >= 0 ? age : null;
}
