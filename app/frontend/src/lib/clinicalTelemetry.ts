type ClinicalTelemetryValue = string | number | boolean | null;

export function clinicalTrace(
  name: string,
  metadata: Record<string, ClinicalTelemetryValue>,
): void {
  console.debug(name, metadata);
}
