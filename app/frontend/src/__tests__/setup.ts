// Vitest setup — runs before each test file.
//
// Adds `@testing-library/jest-dom` matchers (`toBeInTheDocument`, etc.)
// to Vitest's `expect`. See CLAUDE.md §Testing for frontend test conventions.

import { Blob as NodeBlob } from 'node:buffer';
import '@testing-library/jest-dom/vitest';

// jsdom ships a Blob stub without text()/arrayBuffer(); swap in node:buffer's
// Blob so tests can read content back.
globalThis.Blob = NodeBlob as unknown as typeof Blob;

// React Router's data-router navigation creates a Node Request in Vitest's
// jsdom process. jsdom supplies a different AbortSignal realm, so Node 24
// rejects that signal before the memory-router navigation can complete.
// Keep the production Request untouched while making loaderless test
// navigations ignore only the incompatible signal.
const NativeRequest = globalThis.Request;
if (NativeRequest) {
  class TestRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const compatibleInit = init ? { ...init, signal: undefined } : init;
      super(input, compatibleInit);
    }
  }
  globalThis.Request = TestRequest;
}
