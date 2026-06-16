import type { NaiDesktopApi } from "./types";

declare global {
  interface Window {
    naiDesktop: NaiDesktopApi;
  }
}

export {};
