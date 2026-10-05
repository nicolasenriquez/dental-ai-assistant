/**
 * Fail-first contract tests for the AppShell transition guard (task 6.1).
 *
 * Seam for task 6.2 (design decisions 23 and 29): a new hook module
 * `src/hooks/useTransitionGuard.tsx` must export
 *
 *   interface TransitionGuardApi {
 *     registerBlocker: (
 *       blocker: (continueTransition: () => void) => boolean,
 *     ) => () => void;
 *     guardTransition: (continuation: () => void) => void;
 *   }
 *   useTransitionGuard(): TransitionGuardApi
 *
 * and `AppShell` must wrap its children in the matching provider.
 *
 * Contract:
 * - Unmodified left-clicks on same-origin `<a href>` links are captured when
 *   a blocker is registered: the default is prevented and the blocker is
 *   invoked with the queued continuation. When the blocker returns true the
 *   transition stays suspended; invoking the continuation resumes it.
 * - Exactly one pending transition exists: further guarded attempts while
 *   pending are prevented and dropped without re-invoking the blocker.
 * - Modified clicks (ctrl/meta/shift/alt), targeted/new-window links,
 *   download links, and external-origin links bypass the guard.
 * - `guardTransition` is the same programmatic seam used by patient
 *   selection, thread change, and logout; clean transitions run immediately.
 * - Unregistering the blocker restores pass-through navigation.
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

interface TransitionGuardApi {
  registerBlocker: (blocker: (continueTransition: () => void) => boolean) => () => void;
  guardTransition: (continuation: () => void) => void;
}

let useTransitionGuard: (() => TransitionGuardApi) | null = null;

beforeAll(async () => {
  try {
    ({ useTransitionGuard } = await import('../hooks/useTransitionGuard'));
  } catch {
    useTransitionGuard = null;
  }
});

function seam(): TransitionGuardApi {
  if (!useTransitionGuard) {
    throw new Error('missing src/hooks/useTransitionGuard.tsx seam — implement in task 6.2');
  }
  return useTransitionGuard();
}

vi.mock('./DriveBootstrapBanner', () => ({
  DriveBootstrapBanner: () => null,
}));

vi.mock('./Sidebar', () => ({
  Sidebar: () => null,
}));

function Blocker({
  blocked,
  blocker,
  onApi,
}: {
  blocked: boolean;
  blocker: (continueTransition: () => void) => boolean;
  onApi?: (api: TransitionGuardApi) => void;
}) {
  const guard = seam();
  useEffect(() => {
    onApi?.(guard);
    if (!blocked) return;
    return guard.registerBlocker(blocker);
  }, [blocked, blocker, guard, onApi]);
  return null;
}

const alwaysSuspend = (cont: () => void) => {
  cont;
  return true;
};

function renderShell(blocked = false) {
  return render(
    <MemoryRouter>
      <AppShell showConversations={false}>
        <main>
          <a href="/patients">Pacientes</a>
          <a href="https://externo.test/documento" target="_blank" rel="noreferrer">
            Enlace externo
          </a>
          <a href="/informe" download>
            Descarga
          </a>
          <Blocker blocked={blocked} blocker={alwaysSuspend} />
        </main>
      </AppShell>
    </MemoryRouter>,
  );
}

function clickWithPrevention(link: HTMLElement, init?: MouseEventInit) {
  let prevented = false;
  const record = (event: Event) => {
    prevented = event.defaultPrevented;
  };
  link.addEventListener('click', record);
  fireEvent.click(link, init);
  link.removeEventListener('click', record);
  return prevented;
}

describe('AppShell transition guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not capture clean same-origin navigation', () => {
    renderShell(false);

    expect(clickWithPrevention(screen.getByRole('link', { name: 'Pacientes' }))).toBe(false);
  });

  it('captures same-origin links while dirty and queues one continuation', () => {
    let continuation: (() => void) | null = null;
    const blocker = vi.fn((cont: () => void) => {
      continuation = cont;
      return true;
    });
    render(
      <MemoryRouter>
        <AppShell showConversations={false}>
          <main>
            <a href="/patients">Pacientes</a>
            <Blocker blocked blocker={blocker} />
          </main>
        </AppShell>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Pacientes' });
    expect(clickWithPrevention(link)).toBe(true);
    expect(blocker).toHaveBeenCalledTimes(1);

    act(() => continuation?.());
  });

  it('allows exactly one pending transition and drops further attempts', () => {
    let continuation: (() => void) | null = null;
    const blocker = vi.fn((cont: () => void) => {
      continuation = cont;
      return true;
    });
    render(
      <MemoryRouter>
        <AppShell showConversations={false}>
          <main>
            <a href="/patients">Pacientes</a>
            <Blocker blocked blocker={blocker} />
          </main>
        </AppShell>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Pacientes' });
    expect(clickWithPrevention(link)).toBe(true);
    expect(clickWithPrevention(link)).toBe(true);
    expect(blocker).toHaveBeenCalledTimes(1);

    act(() => continuation?.());
    expect(clickWithPrevention(link)).toBe(true);
    expect(blocker).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['ctrlKey', { ctrlKey: true }],
    ['metaKey', { metaKey: true }],
    ['shiftKey', { shiftKey: true }],
    ['altKey', { altKey: true }],
  ])('bypasses modified clicks (%s)', (_label, init) => {
    const blocker = vi.fn(() => true);
    render(
      <MemoryRouter>
        <AppShell showConversations={false}>
          <main>
            <a href="/patients">Pacientes</a>
            <Blocker blocked blocker={blocker} />
          </main>
        </AppShell>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Pacientes' });
    expect(clickWithPrevention(link, init)).toBe(false);
    expect(blocker).not.toHaveBeenCalled();
  });

  it('bypasses external, targeted, and download links', () => {
    const blocker = vi.fn(() => true);
    render(
      <MemoryRouter>
        <AppShell showConversations={false}>
          <main>
            <a href="https://externo.test/documento" target="_blank" rel="noreferrer">
              Enlace externo
            </a>
            <a href="/informe" download>
              Descarga
            </a>
            <Blocker blocked blocker={blocker} />
          </main>
        </AppShell>
      </MemoryRouter>,
    );

    expect(clickWithPrevention(screen.getByRole('link', { name: 'Enlace externo' }))).toBe(false);
    expect(clickWithPrevention(screen.getByRole('link', { name: 'Descarga' }))).toBe(false);
    expect(blocker).not.toHaveBeenCalled();
  });

  it('runs clean programmatic transitions immediately', () => {
    let api: TransitionGuardApi | null = null;
    render(
      <MemoryRouter>
        <AppShell showConversations={false}>
          <Blocker blocked={false} blocker={alwaysSuspend} onApi={(value) => (api = value)} />
        </AppShell>
      </MemoryRouter>,
    );

    const continuation = vi.fn();
    act(() => {
      api?.guardTransition(continuation);
    });
    expect(continuation).toHaveBeenCalledTimes(1);
  });

  it('queues programmatic transitions until the blocker resolves them', () => {
    let api: TransitionGuardApi | null = null;
    let continuation: (() => void) | null = null;
    const blocker = (cont: () => void) => {
      continuation = cont;
      return true;
    };
    render(
      <MemoryRouter>
        <AppShell showConversations={false}>
          <Blocker blocked blocker={blocker} onApi={(value) => (api = value)} />
        </AppShell>
      </MemoryRouter>,
    );

    const target = vi.fn();
    act(() => {
      api?.guardTransition(target);
    });
    expect(target).not.toHaveBeenCalled();

    act(() => continuation?.());
    expect(target).toHaveBeenCalledTimes(1);
  });

  it('drops a second programmatic transition while one is pending', () => {
    let api: TransitionGuardApi | null = null;
    let continuation: (() => void) | null = null;
    const blocker = vi.fn((cont: () => void) => {
      continuation = cont;
      return true;
    });
    render(
      <MemoryRouter>
        <AppShell showConversations={false}>
          <Blocker blocked blocker={blocker} onApi={(value) => (api = value)} />
        </AppShell>
      </MemoryRouter>,
    );

    act(() => {
      api?.guardTransition(vi.fn());
      api?.guardTransition(vi.fn());
    });
    expect(blocker).toHaveBeenCalledTimes(1);

    act(() => continuation?.());
  });

  it('restores pass-through navigation after unregistering the blocker', () => {
    const blocker = vi.fn(() => true);
    const view = render(
      <MemoryRouter>
        <AppShell showConversations={false}>
          <main>
            <a href="/patients">Pacientes</a>
            <Blocker blocked blocker={blocker} />
          </main>
        </AppShell>
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Pacientes' });
    expect(clickWithPrevention(link)).toBe(true);

    view.rerender(
      <MemoryRouter>
        <AppShell showConversations={false}>
          <main>
            <a href="/patients">Pacientes</a>
            <Blocker blocked={false} blocker={blocker} />
          </main>
        </AppShell>
      </MemoryRouter>,
    );

    expect(clickWithPrevention(screen.getByRole('link', { name: 'Pacientes' }))).toBe(false);
  });
});
