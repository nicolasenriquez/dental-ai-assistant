import { getDrivePickerToken } from './api';

interface PickerDocument {
  id?: unknown;
}

interface PickerResponse {
  action?: string;
  docs?: PickerDocument[];
}

interface PickerInstance {
  setVisible?: (visible: boolean) => void;
  dispose?: () => void;
}

interface PickerBuilder {
  setAppId: (appId: string) => PickerBuilder;
  setDeveloperKey: (key: string) => PickerBuilder;
  setOAuthToken: (token: string) => PickerBuilder;
  setOrigin: (origin: string) => PickerBuilder;
  addView: (view: unknown) => PickerBuilder;
  setCallback: (callback: (response: PickerResponse) => void) => PickerBuilder;
  build: () => PickerInstance;
}

interface PickerNamespace {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (
    viewId?: unknown,
  ) => {
    setMimeTypes: (mimeTypes: string) => unknown;
    setIncludeFolders?: (include: boolean) => unknown;
  };
  Action?: { PICKED?: string; CANCEL?: string; ERROR?: string; LOADED?: string };
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
  const env = import.meta.env;
  const appId = env.VITE_GOOGLE_DRIVE_APP_ID;
  const developerKey = env.VITE_GOOGLE_PICKER_API_KEY;
  if (!appId) throw new Error('GOOGLE_PICKER_APP_ID_MISSING');
  if (!/^\d+$/.test(appId)) throw new Error('GOOGLE_PICKER_APP_ID_INVALID');
  if (!developerKey) throw new Error('GOOGLE_PICKER_API_KEY_MISSING');

  const { access_token: accessToken } = await getDrivePickerToken(patientId);
  await loadPickerApi();

  const picker = window.google?.picker;
  if (!picker) throw new Error('Google Picker no está disponible.');

  return new Promise<string | null>((resolve, reject) => {
    let settled = false;
    let pickerInstance: PickerInstance | null = null;
    const pickedAction = picker.Action?.PICKED ?? 'picked';
    const cancelAction = picker.Action?.CANCEL ?? 'cancel';
    const errorAction = picker.Action?.ERROR ?? 'error';
    const loadedAction = picker.Action?.LOADED ?? 'loaded';
    const closePicker = () => {
      pickerInstance?.setVisible?.(false);
      pickerInstance?.dispose?.();
    };
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      closePicker();
      resolve(value);
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      closePicker();
      reject(new Error(message));
    };
    const view = new picker.DocsView(picker.ViewId?.DOCS);
    view.setMimeTypes('text/plain,text/markdown');
    view.setIncludeFolders?.(false);
    const builder = new picker.PickerBuilder();
    builder.setAppId(appId);
    builder.setDeveloperKey(developerKey);
    builder.setOAuthToken(accessToken);
    builder.setOrigin(window.location.origin);
    builder.addView(view);
    builder.setCallback((response) => {
      if (response.action === errorAction) {
        fail('GOOGLE_PICKER_ACTION_ERROR');
        return;
      }
      if (response.action === loadedAction) return;
      if (response.action !== pickedAction && response.action !== cancelAction) {
        fail('GOOGLE_PICKER_UNKNOWN_ACTION');
        return;
      }
      const id = response.docs?.[0]?.id;
      if (response.action === pickedAction && typeof id !== 'string') {
        fail('GOOGLE_PICKER_DOCUMENT_ID_MISSING');
        return;
      }
      finish(response.action === pickedAction && typeof id === 'string' ? id : null);
    });
    pickerInstance = builder.build();
    pickerInstance.setVisible?.(true);
  });
}
