# Video library chat

## Sub-features

New chat, video-library search, streamed answer, citations, conversation history/rename/delete, Markdown download, and stop/queue/edit/remove pending messages. Administrators can also ingest videos from the library.

## How to get to it (user POV)

After sign-in, open `/chat` or an existing `/c/:conversationId`. Library opens from `Biblioteca`.

## Driving it with Playwright CLI

Capture empty chat state; click `Biblioteca` and confirm dialog `Biblioteca de videos`. Wait for loading to finish. A nonempty library offers `Buscar videos`; search a visible title, prove matches, then an impossible term, prove no matches, and clear the search. An empty library instead shows `Aún no hay videos en la base de conocimiento.` and has no searchbox. Close with `Cerrar biblioteca de videos`.

For full RAG proof on a disposable account with OpenRouter and indexed content, ask a specific question about an existing video in `Pregunta sobre la biblioteca de videos`. Send via `Enviar mensaje`, observe streaming/completion, then reload `/c/:conversationId` and confirm persisted messages. Open a retrieved citation and inspect its title, snippet, and timestamp. YouTube citations provide timestamp deep-links and an embedded player; Dynamous citations provide lesson links and timestamp text. An uncited answer cannot prove citation behavior. Preserve before/action/after evidence without credentials.

## Gotchas

Seed videos have fake YouTube IDs; deep-links are not playable for them. `app-baseline.spec.ts` mocks conversation and stream responses. Sending questions uses OpenRouter and rate limits; read-only library browsing is safe on shared account.
