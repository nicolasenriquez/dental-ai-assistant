/**
 * Fail-first contract tests for the managed Drive API wrappers (task 5.1).
 *
 * Seam for task 5.2: `src/lib/api.ts` must gain the typed wrappers below
 * (all fetches stay in this one file). Every call goes through the existing
 * `request()` seam with `credentials: 'include'`.
 *
 *   interface DriveFile { id; name; version; mimeType; modifiedTime }
 *   interface DriveFilePage { files: DriveFile[]; next_page_token: string | null }
 *   interface DriveFileContent extends DriveFile { content: string }
 *   listDriveFiles(patientId, pageToken?)
 *   searchDriveFiles({ patient_id, query, page_token? })
 *   getDriveFile(fileId, patientId)
 *   createDriveFile({ patient_id, operation_id, name, content })
 *   updateDriveFile(fileId, { patient_id, operation_id, content, expected_version })
 *   getDrivePickerToken(patientId)
 *   importDriveCopy({ patient_id, operation_id, source_file_id, name? })
 *   recreateDriveWorkspace(operationId, acknowledgePossibleOrphan)
 *   disconnectDrive()
 *
 * Endpoint paths mirror `routes/google_drive.py` exactly. Search is
 * body-based (no query terms in URLs); names/terms never enter browser URLs.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';

type DriveFile = {
  id: string;
  name: string;
  version: string;
  mimeType: string;
  modifiedTime: string;
};

type DriveFilePage = { files: DriveFile[]; next_page_token: string | null };

type DriveApiSeam = {
  listDriveFiles?: (patientId: string, pageToken?: string) => Promise<unknown>;
  searchDriveFiles?: (body: {
    patient_id: string;
    query: string;
    page_token?: string;
  }) => Promise<unknown>;
  getDriveFile?: (fileId: string, patientId: string) => Promise<unknown>;
  createDriveFile?: (body: {
    patient_id: string;
    operation_id: string;
    name: string;
    content: string;
  }) => Promise<unknown>;
  updateDriveFile?: (
    fileId: string,
    body: {
      patient_id: string;
      operation_id: string;
      content: string;
      expected_version: string;
    },
  ) => Promise<unknown>;
  getDrivePickerToken?: (patientId: string) => Promise<unknown>;
  importDriveCopy?: (body: {
    patient_id: string;
    operation_id: string;
    source_file_id: string;
    name?: string;
  }) => Promise<unknown>;
  recreateDriveWorkspace?: (
    operationId: string,
    acknowledgePossibleOrphan: boolean,
  ) => Promise<unknown>;
  disconnectDrive?: () => Promise<unknown>;
};

const seam = api as unknown as DriveApiSeam;

function missing(seamFn: unknown): never {
  throw new Error(`missing api seam: ${seamFn as string} — implement in task 5.2`);
}

function call<T>(fn: T | undefined, name: string): T {
  if (!fn) throw missing(name);
  return fn;
}

const fileBody: DriveFile = {
  id: 'f1',
  name: 'nota.txt',
  version: '10',
  mimeType: 'text/plain',
  modifiedTime: '2026-09-01T10:00:00Z',
};

describe('managed Drive api wrappers', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockJson(body: unknown, status = 200) {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
  }

  function lastFetch(): [string, RequestInit] {
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    return calls[calls.length - 1] as [string, RequestInit];
  }

  it('listDriveFiles GETs the patient-scoped page with credentials', async () => {
    const page: DriveFilePage = { files: [fileBody], next_page_token: null };
    mockJson(page);
    const res = await call(seam.listDriveFiles, 'listDriveFiles')('p1');
    expect(res).toEqual(page);
    const [url, init] = lastFetch();
    expect(url).toBe('/api/google-drive/files?patient_id=p1');
    expect(init.method).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('listDriveFiles appends an opaque page token', async () => {
    mockJson({ files: [], next_page_token: null });
    await call(seam.listDriveFiles, 'listDriveFiles')('p1', 'tok123');
    const [url] = lastFetch();
    expect(url).toBe('/api/google-drive/files?patient_id=p1&page_token=tok123');
  });

  it('searchDriveFiles POSTs the body-scoped query without touching the URL', async () => {
    mockJson({ files: [], next_page_token: null });
    await call(
      seam.searchDriveFiles,
      'searchDriveFiles',
    )({
      patient_id: 'p1',
      query: 'control',
      page_token: 'tok9',
    });
    const [url, init] = lastFetch();
    expect(url).toBe('/api/google-drive/files/search');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      patient_id: 'p1',
      query: 'control',
      page_token: 'tok9',
    });
    expect(init.credentials).toBe('include');
  });

  it('getDriveFile GETs the validated read for the patient', async () => {
    mockJson({ ...fileBody, content: 'texto\n' });
    const res = await call(seam.getDriveFile, 'getDriveFile')('f1', 'p1');
    expect(res).toEqual({ ...fileBody, content: 'texto\n' });
    const [url, init] = lastFetch();
    expect(url).toBe('/api/google-drive/files/f1?patient_id=p1');
    expect(init.credentials).toBe('include');
  });

  it('createDriveFile POSTs the managed TXT contract with no MIME selector', async () => {
    mockJson(fileBody, 201);
    const body = {
      patient_id: 'p1',
      operation_id: 'op-1',
      name: 'nota.txt',
      content: 'exportado\n',
    };
    await call(seam.createDriveFile, 'createDriveFile')(body);
    const [url, init] = lastFetch();
    expect(url).toBe('/api/google-drive/files');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual(body);
    expect(JSON.parse(init.body as string)).not.toHaveProperty('mimeType');
  });

  it('updateDriveFile PUTs content and expected version without name or MIME', async () => {
    mockJson(fileBody);
    await call(seam.updateDriveFile, 'updateDriveFile')('f1', {
      patient_id: 'p1',
      operation_id: 'op-2',
      content: 'nuevo\n',
      expected_version: '10',
    });
    const [url, init] = lastFetch();
    expect(url).toBe('/api/google-drive/files/f1');
    expect(init.method).toBe('PUT');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      patient_id: 'p1',
      operation_id: 'op-2',
      content: 'nuevo\n',
      expected_version: '10',
    });
    expect(body).not.toHaveProperty('name');
    expect(body).not.toHaveProperty('mimeType');
  });

  it('getDrivePickerToken POSTs only the owned patient', async () => {
    mockJson({ access_token: 'at', expires_in: 300 });
    await call(seam.getDrivePickerToken, 'getDrivePickerToken')('p1');
    const [url, init] = lastFetch();
    expect(url).toBe('/api/google-drive/picker-token');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ patient_id: 'p1' });
  });

  it('importDriveCopy POSTs the untrusted source ID for a managed copy', async () => {
    mockJson(fileBody, 201);
    await call(
      seam.importDriveCopy,
      'importDriveCopy',
    )({
      patient_id: 'p1',
      operation_id: 'op-3',
      source_file_id: 'src-9',
      name: 'copia.txt',
    });
    const [url, init] = lastFetch();
    expect(url).toBe('/api/google-drive/import-copy');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      patient_id: 'p1',
      operation_id: 'op-3',
      source_file_id: 'src-9',
      name: 'copia.txt',
    });
  });

  it('recreateDriveWorkspace POSTs the operation and orphan acknowledgement', async () => {
    mockJson({ configured: true, status: 'connected' });
    await call(seam.recreateDriveWorkspace, 'recreateDriveWorkspace')('op-4', true);
    const [url, init] = lastFetch();
    expect(url).toBe('/api/google-drive/workspace/recreate');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      operation_id: 'op-4',
      acknowledge_possible_orphan: true,
    });
  });

  it('disconnectDrive POSTs the explicit disconnect', async () => {
    mockJson({ configured: true, status: 'disconnected' });
    await call(seam.disconnectDrive, 'disconnectDrive')();
    const [url, init] = lastFetch();
    expect(url).toBe('/api/google-drive/disconnect');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
  });
});
