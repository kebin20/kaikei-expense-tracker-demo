// The web app has no native dependencies. The bundled entry installs this
// adapter before mounting the shared React UI.
import { durableRecoveryStorage } from './recovery-storage.ts';
let webRecovery: Storage | undefined;
export interface ClientRuntime {
  browserLocal?: boolean;
  request?: (input: RequestInfo | URL, init: RequestInit) => Promise<Response>;
  recoveryStorage?: Storage;
  commitValue?: (key: string, value: string) => Promise<void>;
  flushRecovery?: () => Promise<void>;
  saveFile?: (
    filename: string,
    contents: string,
    type: string,
  ) => Promise<void>;
  readSnapshot?: <T>(key: string) => Promise<T | null>;
  writeSnapshot?: <T>(key: string, value: T) => Promise<void>;
  isOnline?: () => boolean;
}

let runtime: ClientRuntime | undefined;

export function installClientRuntime(value: ClientRuntime | undefined) {
  runtime = value;
}

export function getClientRuntime() {
  return runtime;
}

export function recoveryStorage() {
  if (runtime?.recoveryStorage) return runtime.recoveryStorage;
  webRecovery ??= durableRecoveryStorage(localStorage, sessionStorage);
  return webRecovery;
}

export function deviceOnline() {
  return runtime?.isOnline?.() ?? navigator.onLine;
}
