import type { NaodaiApi } from './ipc';

declare global {
  interface Window {
    api: NaodaiApi;
  }
}

export {};