---
name: observability-and-instrumentation
description: Add safe, useful logging, metrics, tracing, and alerting to production code. Use when adding I/O, queues, retries, external calls, or diagnosing missing operational evidence.
---

# Observability and Instrumentation

Start with two to four on-call questions. Add only signals that answer them.

## licitAI Repository Contract

- Reuse existing `LoggerService`, Sentry, `MetricsService`, and OpenTelemetry
  integrations in `packages/twenty-server`.
- Do not add another logging, metrics, tracing, or alerting stack without proof
  the existing integration cannot support the requirement.
- Follow `security-review` for secrets, credentials, request bodies, and PII.
- Use `docs/operations/ci.md` and current repository operations documentation
  for release and incident procedures.

## Signals

- Logs answer what happened in one case.
- Metrics answer how often and how fast.
- Traces answer where time or failure crossed boundaries.
- Alerts page on user symptoms, not infrastructure causes.

## Logging

- Use stable event names and allowlisted fields.
- Propagate a correlation ID through requests, outbound calls, and queues.
- Accept `x-request-id` only when it matches `[A-Za-z0-9._-]{1,128}`; otherwise
  generate a UUID.
- Never log authorization headers, tokens, passwords, request bodies, secrets,
  or unredacted PII.
- Redact external payloads and error messages before logging.

## Metrics and Tracing

- Use RED for endpoints and external dependencies: rate, errors, duration.
- Use USE for queues and resources: utilization, saturation, errors.
- Use histograms and bounded labels. Never use user IDs, tenant IDs, request
  IDs, raw URLs, or error text as metric labels.
- Use existing OpenTelemetry setup and propagate W3C trace context across HTTP
  and queue boundaries.
- Add manual spans only around meaningful units of work.

## Alerts and Verification

- Every alert has an actionable threshold, duration, severity, and runbook.
- Use two severities: `page` for user-facing impact and `ticket` for degraded
  service.
- Induce a staging failure and locate it through telemetry alone.
- Confirm logs are structured, metric labels are bounded, and traces are not
  broken across async boundaries.

## References

- `packages/twenty-server/src/instrument.ts`
- `packages/twenty-server/src/engine/core-modules/logger/`
- `packages/twenty-server/src/engine/core-modules/metrics/`
- `docs/operations/ci.md`
