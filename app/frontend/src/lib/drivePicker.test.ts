/**
 * Fail-first contract tests for the raw Google Picker integration (task 6.1).
 *
 * Seam for task 6.2 (design decision 16): `src/lib/drivePicker.ts` must
 * export
 *
 *   openDrivePicker(patientId: string): Promise<string | null>
 *
 * that resolves with the selected source file id or null on cancel/close.
 *
 * Contract:
 * - Requests a fresh no-store Picker token per open through
 *   `getDrivePickerToken(patientId)`; `expires_in` never extends reuse and
 *   the access token is held in function memory only — never persisted to
 *   localStorage, sessionStorage, IndexedDB, or cookies.
 * - Loads the official Google API script once and constructs the raw
 *   `google.picker.PickerBuilder` with the public build-time app id
 *   (`VITE_GOOGLE_DRIVE_APP_ID`) and API key (`VITE_GOOGLE_PICKER_API_KEY`),
 *   the OAuth token, the current origin, exactly one filtered DocsView
 *   (text files only), and a callback. No React wrapper package.
 * - The picked document id is the only value returned; the caller owns the
 *   patient-bound import through `importDriveCopy`.
 */

import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';

type DrivePickerSeam = {
  openDrivePicker: (patientId: string) => Promise<string | null>;
};

let drivePicker: DrivePickerSeam | null = null;

beforeAll(async () => {
  try {
    drivePicker = await import('../lib/drivePicker');
  } catch {
    drivePicker = null;
  }
});

function seam(): DrivePickerSeam {
  if (!drivePicker) {
    throw new Error('missing src/lib/drivePicker.ts seam — implement in task 6.2');
  }
  return drivePicker;
}

vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>();
  return {
    ...actual,
    getDrivePickerToken: vi.fn(),
  };
});

const getDrivePickerTokenMock = api.getDrivePickerToken as unknown as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_GOOGLE_PICKER_API_KEY', 'picker-api-key');
  vi.stubEnv('VITE_GOOGLE_DRIVE_APP_ID', 'picker-app-id');
  getDrivePickerTokenMock.mockResolvedValue({ access_token: 'access-token-1', expires_in: 300 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const builderCalls = {
  setAppId: vi.fn(),
  setDeveloperKey: vi.fn(),
  setOAuthToken: vi.fn(),
  setOrigin: vi.fn(),
  addView: vi.fn(),
  setCallback: vi.fn(),
  build: vi.fn(() => ({ setVisible: vi.fn() })),
};

class MockDocsView {
  setMimeTypes = vi.fn();
  setIncludeFolders = vi.fn();
}

const gapiLoad = vi.fn((_api: string, done: () => void) => {
  queueMicrotask(done);
});

async function openAndCancel(patientId: string): Promise<void> {
  const previousCallbackCount = builderCalls.setCallback.mock.calls.length;
  const opening = seam().openDrivePicker(patientId);
  await vi.waitFor(() =>
    expect(builderCalls.setCallback.mock.calls.length).toBeGreaterThan(previousCallbackCount),
  );
  const calls = builderCalls.setCallback.mock.calls;
  const [callback] = calls[calls.length - 1];
  callback({ action: 'cancel' });
  await expect(opening).resolves.toBeNull();
}

function stubPickerGlobals() {
  const picker = {
    PickerBuilder: vi.fn(() => builderCalls),
    DocsView: MockDocsView,
    ViewId: { DOCS: 'DOCS' },
  };
  vi.stubGlobal('google', {
    picker,
  });
  vi.stubGlobal('gapi', { load: gapiLoad });
}

function stubStorageSpies() {
  const localSet = vi.spyOn(Storage.prototype, 'setItem');
  const sessionSet = vi.spyOn(Storage.prototype, 'setItem');
  const cookieSet = vi.spyOn(document, 'cookie', 'set');
  return { localSet, sessionSet, cookieSet };
}

describe('openDrivePicker', () => {
  it('requests a fresh patient-bound token before building the Picker', async () => {
    stubPickerGlobals();
    await openAndCancel('p1');

    expect(getDrivePickerTokenMock).toHaveBeenCalledWith('p1');
    expect(builderCalls.setOAuthToken).toHaveBeenCalledWith('access-token-1');
  });

  it('constructs the raw PickerBuilder with the exact app config and origin', async () => {
    stubPickerGlobals();
    await openAndCancel('p1');

    expect(builderCalls.setAppId).toHaveBeenCalledWith('picker-app-id');
    expect(builderCalls.setDeveloperKey).toHaveBeenCalledWith('picker-api-key');
    expect(builderCalls.setOrigin).toHaveBeenCalledWith(window.location.origin);
    expect(builderCalls.setCallback).toHaveBeenCalled();
    expect(builderCalls.build).toHaveBeenCalled();
  });

  it('adds exactly one DocsView filtered to text files', async () => {
    stubPickerGlobals();
    await openAndCancel('p1');

    expect(builderCalls.addView).toHaveBeenCalledTimes(1);
    const [view] = builderCalls.addView.mock.calls[0];
    expect(view).toBeInstanceOf(MockDocsView);
    expect(view.setMimeTypes).toHaveBeenCalledWith(expect.arrayContaining(['text/plain']));
  });

  it('resolves with the picked document id', async () => {
    stubPickerGlobals();
    const opening = seam().openDrivePicker('p1');

    await vi.waitFor(() => expect(builderCalls.setCallback).toHaveBeenCalled());
    const [callback] = builderCalls.setCallback.mock.calls[0];
    callback({ action: 'picked', docs: [{ id: 'source-file-1' }] });

    await expect(opening).resolves.toBe('source-file-1');
  });

  it('resolves null when the user cancels', async () => {
    stubPickerGlobals();
    const opening = seam().openDrivePicker('p1');

    await vi.waitFor(() => expect(builderCalls.setCallback).toHaveBeenCalled());
    const [callback] = builderCalls.setCallback.mock.calls[0];
    callback({ action: 'cancel' });

    await expect(opening).resolves.toBeNull();
  });

  it('never persists the Picker token anywhere', async () => {
    stubPickerGlobals();
    const spies = stubStorageSpies();
    await openAndCancel('p1');

    expect(spies.localSet).not.toHaveBeenCalled();
    expect(spies.sessionSet).not.toHaveBeenCalled();
    expect(spies.cookieSet).not.toHaveBeenCalled();
  });

  it('requests a fresh token per open instead of reusing expired material', async () => {
    stubPickerGlobals();
    await openAndCancel('p1');
    await openAndCancel('p1');

    expect(getDrivePickerTokenMock).toHaveBeenCalledTimes(2);
    expect(builderCalls.setOAuthToken).toHaveBeenLastCalledWith('access-token-1');
  });

  it('loads the official Google API script exactly once across opens', async () => {
    stubPickerGlobals();
    await openAndCancel('p1');
    await openAndCancel('p1');

    expect(gapiLoad).toHaveBeenCalledTimes(1);
    expect(gapiLoad.mock.calls[0][0]).toBe('picker');
  });

  it('keeps patient identity on every Picker action', async () => {
    stubPickerGlobals();
    await openAndCancel('patient-a');
    await openAndCancel('patient-b');

    expect(getDrivePickerTokenMock).toHaveBeenNthCalledWith(1, 'patient-a');
    expect(getDrivePickerTokenMock).toHaveBeenNthCalledWith(2, 'patient-b');
  });
});
