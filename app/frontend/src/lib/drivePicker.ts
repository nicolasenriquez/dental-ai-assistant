import { getDrivePickerToken } from './api';

interface PickerDocument {
  id?: unknown;
}

interface PickerResponse {
  action?: string;
  docs?: PickerDocument[];
}

interface PickerBuilder {
  setAppId: (appId: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setOrigin: (origin: string) => PickerBuilder;
  addView: (view: unknown) => PickerBuilder;
  setCallback: (callback: (response: PickerResponse) => void) => PickerBuilder;
  build: () => { setVisible?: (visible: boolean) => void };
}

interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (
    viewId?: unknown,
  ) => {
    setMimeTypes: (mimeTypes: string[]) => unknown;
    setIncludeFolders?: (include: boolean) => unknown;
  };
  ViewId?: { DOCS?: unknown };
}

interface GooglePickerGlobal {
  picker?: PickerNamespace;
}

interface GapiGlobal {
  load: (api: string, callback: () => void) => void;
}

declare global {
  interface ImportMeta {
    readonly env: Record<string, string | undefined>;
  }

  interface Window {
    google?: GooglePickerGlobal;
    gapi?: GapiGlobal;
  }
}

let loadedGapi: GapiGlobal | null = null;
let pickerApiPromise: Promise<void> | null = null;

function loadPickerApi(): Promise<void> {
  const gapi = window.gapi;
  if (gapi) {
    if (loadedGapi === gapi && pickerApiPromise) return pickerApiPromise;
    loadedGapi = gapi;
    pickerApiPromise = new Promise<void>((resolve) => gapi.load('picker', resolve));
    return pickerApiPromise;
  }

  if (pickerApiPromise) return pickerApiPromise;
  pickerApiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-drive-picker-api]');
    const script = existing ?? document.createElement('script');
    const onLoad = () => {
      if (!window.gapi) {
        reject(new Error('Google Picker no está disponible.'));
        return;
      }
      loadedGapi = window.gapi;
      window.gapi.load('picker', resolve);
    };
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', () => reject(new Error('Google Picker no está disponible.')), {
      once: true,
    });
    if (!existing) {
      script.dataset.drivePickerApi = 'true';
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      document.head.appendChild(script);
    }
  });
  return pickerApiPromise;
}

export async function openDrivePicker(patientId: string): Promise<string | null> {
  const { access_token: accessToken } = await getDrivePickerToken(patientId);
  await loadPickerApi();

  const picker = window.google?.picker;
  if (!picker) throw new Error('Google Picker no está disponible.');

  return new Promise<string | null>((resolve) => {
    const env = import.meta.env;
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const view = new picker.DocsView(picker.ViewId?.DOCS);
    view.setMimeTypes(['text/plain', 'text/markdown']);
    view.setIncludeFolders?.(false);
    const builder = new picker.PickerBuilder();
    builder.setAppId(env.VITE_GOOGLE_DRIVE_APP_ID ?? '');
    builder.setDeveloperKey(env.VITE_GOOGLE_PICKER_API_KEY ?? '');
    builder.setOAuthToken(accessToken);
    builder.setOrigin(window.location.origin);
    builder.addView(view);
    builder.setCallback((response) => {
      const id = response.docs?.[0]?.id;
      finish(response.action === 'picked' && typeof id === 'string' ? id : null);
    });
    builder.build().setVisible?.(true);
  });
}
