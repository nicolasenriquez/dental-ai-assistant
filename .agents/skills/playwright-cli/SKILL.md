---
name: playwright-cli
description: Run explicit browser checks against local or test environments through the repository Playwright CLI.
allowed-tools: Bash(yarn --cwd packages/twenty-e2e-testing playwright cli:*)
disable-model-invocation: true
---

# Playwright CLI

Use the repository-local Playwright version only:

```bash
yarn --cwd packages/twenty-e2e-testing playwright cli <command>
```

## Safety Rules

- Target local or test origins. Production requires explicit user approval.
- Create isolated, in-memory sessions. Do not attach to an existing browser,
  extension, CDP endpoint, or personal profile by default.
- Never read, print, export, or save cookies, tokens, passwords, or auth state.
- Use synthetic test data. Uploads, clipboard access, permissions, tracing,
  video, and `run-code` require explicit approval.
- `install`, `install-browser`, `attach`, `delete-data`, `close-all`, and
  `kill-all` require explicit approval.
- Do not copy secrets into commands, screenshots, traces, videos, or artifacts.
- Close sessions after each task.

## Safe Flow

```bash
yarn --cwd packages/twenty-e2e-testing playwright cli open http://localhost:3000
yarn --cwd packages/twenty-e2e-testing playwright cli snapshot
yarn --cwd packages/twenty-e2e-testing playwright cli close
```

For automated tests, use the existing package scripts and Playwright config.
Do not install a global CLI or use `npm`, `npx`, or a second Playwright version.

Official CLI reference: https://github.com/microsoft/playwright-cli/blob/main/README.md
