# Playwright QA baseline

Registro operativo de la revisión QA por vista. La suite determinista es
`app/frontend/tests/qa-baseline.spec.ts` y se ejecuta sin credenciales reales.

## Identificación

| Campo | Valor |
| --- | --- |
| Suite | `qa-baseline` |
| Configuración | `app/frontend/playwright.config.ts` |
| Viewports | `1440x1000`, `1280x800`, `1024x768`, `390x844` |
| Fecha de implementación | 2026-09-14 |
| Commit de referencia | `cc35198e77d4351a5f05e97b51a97027ecea8484` |
| Datos | APIs mockeadas en la frontera HTTP |

## Matriz de evidencia

| ID | Vista/flujo | Evidencia y resultado | Estado |
| --- | --- | --- | --- |
| QA-1 | Login, signup, 404 | [ARIA](../../app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/qa-login.aria.yml), [screenshots](../../app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/qa-login-qa-baseline-win32.png) y validaciones observables | PASS |
| QA-2 | Pacientes y detalle | [ARIA de pacientes](../../app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/qa-patients.aria.yml), [detalle](../../app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/qa-patient-detail.aria.yml) y diálogos de edición/salida | PASS |
| QA-3 | Nueva evolución | [ARIA vacío](../../app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/qa-new-evolution-empty.aria.yml), [revisión](../../app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/qa-new-evolution-review.aria.yml), regeneración y confirmación | PASS |
| QA-4 | Chat y conversación | [ARIA chat vacío](../../app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/qa-chat-empty.aria.yml), [conversación](../../app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/qa-chat-conversation.aria.yml), [biblioteca](../../app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/qa-video-library.aria.yml) y flujo SSE/menu | PASS |
| QA-5 | Asistente clínico y Drive | [ARIA clínico](../../app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/qa-clinical-empty.aria.yml), screenshot y lifecycle de revisión/Drive | PASS |
| QA-6 | Administración | [ARIA](../../app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/qa-admin.aria.yml), screenshot y acciones con confirmación nativa | PASS |
| QA-7 | Responsive transversal | Visibilidad, navegación móvil y ausencia de overflow en cuatro tamaños; [implementación](../../app/frontend/tests/qa-baseline.spec.ts) | PASS |

La ejecución final de `qa-baseline` fue `6/6 PASS` en 19.6 s. El helper de
runtime no registró `pageerror`, errores de consola inesperados ni requests
fallidos inesperados. Los screenshots y snapshots generados se almacenan bajo
`app/frontend/tests/__snapshots__/qa-baseline.spec.ts-snapshots/`; los traces y
screenshots de fallo se conservan en la salida temporal configurada por
Playwright cuando una ejecución falla.

## Comandos

```powershell
cd app/frontend
bun x playwright test --project=qa-baseline --no-deps
bun x playwright test --project=drive-bootstrap --no-deps
bun run type-check
bun run build
bun run lint
```

Resultados de aceptación del 2026-09-14:

| Comando | Resultado |
| --- | --- |
| `bun x playwright test --project=qa-baseline --no-deps` | PASS — 6/6 |
| `bun x playwright test --project=drive-bootstrap --no-deps` | PASS — 9/9 |
| `bun run type-check` | PASS |
| `bun run build` | PASS — warning no bloqueante de chunks grandes y warning CJS de Vite |
| `bun run lint` | BLOCKED — import order preexistente en `src/__tests__/authBootstrapMode.test.tsx` |

## Exploración manual con playwright-cli

Se verificó el flujo CLI mínimo sobre `/login` sin credenciales:

```powershell
playwright-cli -s=qa-manual open http://localhost:8000/login
playwright-cli -s=qa-manual snapshot
playwright-cli -s=qa-manual close
```

El snapshot local quedó en `.playwright-cli/page-2026-09-14T20-36-09-115Z.yml`.
La vista pública mostró el acceso Google; el log CLI registró errores de
runtime del entorno sin autenticación, por lo que esta exploración no se
clasifica como validación del proveedor externo. La evidencia reproducible y
versionada es la suite mockeada y sus snapshots bajo `tests/__snapshots__`.

## Evidencia heredada y bloqueos conocidos

| Lane | Resultado conocido | Clasificación |
| --- | --- | --- |
| `drive-bootstrap` | 9/9 pasa con mocks | PASS |
| `clinical --no-deps` | 11/13; orden de dictado esperado difiere y concurrencia devuelve 401 sin setup | BLOCKED |
| `baseline` | Requiere `E2E_USER` y `E2E_PASSWORD` | BLOCKED |
| `provider-smoke` | Requiere ejecución opt-in y proveedor Google | NOT RUN |

No se guardan credenciales ni estados de sesión en el repositorio. Las
actualizaciones de snapshots requieren revisión explícita de cada diferencia.
