# Video library chat

## Sub-features

New chat, video library, streamed answer, citations, conversation history.

## How to get to it (user POV)

After sign-in, open `/chat` or an existing `/c/:conversationId`. Library opens from `Biblioteca`.

## Driving it with Playwright CLI

Capture empty chat snapshot; click `Biblioteca`, confirm dialog `Biblioteca de videos` and searchbox `Buscar videos`. For full live proof on a disposable account with OpenRouter configured, enter a benign question in `Pregunta sobre la biblioteca de videos`, send via `Enviar mensaje`, wait for completed response/citations, then reload `/c/:conversationId` and confirm persisted messages and source deep-link. Preserve before/action/after evidence without credentials.

## Gotchas

Seed videos have fake YouTube IDs; deep-links are not playable for them. `app-baseline.spec.ts` mocks conversation and stream responses. Sending questions uses OpenRouter and rate limits; read-only library browsing is safe on shared account.
